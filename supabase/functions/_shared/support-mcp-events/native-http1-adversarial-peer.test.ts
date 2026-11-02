/** Independent adversarial contract tests. No sockets, Deno runtime, keys or HTTP. */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readHttp1Response,serializeHttp1Request,writeAll} from './native-http1.ts';
import {CallbackTransportError} from './callback-policy.ts';

const encode=(s:string)=>new TextEncoder().encode(s);
const text=(b:Uint8Array)=>new TextDecoder().decode(b);
function wire(headers:string[],body='',status='HTTP/1.1 200 OK'){
 return encode([status,...headers,'',''].join('\r\n')+body);
}
function fakeReader(bytes:Uint8Array,fragment=bytes.length||1){
 let offset=0,calls=0;
 return {calls:()=>calls,read:async(buffer:Uint8Array)=>{
  if(++calls>100000)throw Error('synthetic read budget exhausted');
  if(offset===bytes.length)return null;
  const n=Math.min(fragment,buffer.length,bytes.length-offset);
  buffer.set(bytes.subarray(offset,offset+n));offset+=n;return n;
 }};
}
async function parse(bytes:Uint8Array,maxBodyBytes=4096,method:'HEAD'|'POST'='POST',fragment?:number){
 const reader=fakeReader(bytes,fragment);return readHttp1Response(reader.read,{method,maxBodyBytes});
}
async function malformed(bytes:Uint8Array,maxBodyBytes=4096,method:'HEAD'|'POST'='POST'){
 await assert.rejects(parse(bytes,maxBodyBytes,method),error=>error instanceof CallbackTransportError);
}

test('independent parser preserves exact fixed-length bytes across one-byte fragmentation',async()=>{
 const body=encode('{"text":"ёж"}');
 const header=wire(['Content-Length: '+body.length]);const bytes=new Uint8Array(header.length+body.length);bytes.set(header);bytes.set(body,header.length);
 const result=await parse(bytes,body.length,'POST',1);assert.equal(result.status,200);assert.deepEqual(result.body,body);
});
test('close-delimited response requires EOF and stays within the body budget',async()=>{
 assert.equal(text((await parse(wire(['Connection: close'],'abc'),3)).body),'abc');
 await malformed(wire(['Connection: close'],'abcd'),3);
});
test('fixed-length limit is enforced before reading a promised oversized body',async()=>{
 const bytes=wire(['Content-Length: 1048576']);let calls=0;
 await assert.rejects(readHttp1Response(async b=>{if(++calls>1)throw Error('body should not be read');b.set(bytes);return bytes.length;},{method:'POST',maxBodyBytes:3}),e=>e instanceof CallbackTransportError&&e.reason==='response_too_large');
 assert.equal(calls,1);
});
test('HEAD may advertise nonzero Content-Length but returns immediately with no actual body',async()=>{
 const bytes=wire(['Content-Length: 1234567','Content-Type: text/html','Content-Encoding: gzip']);let calls=0;
 const result=await readHttp1Response(async b=>{if(++calls>1)throw Error('HEAD must not wait for EOF or advertised body');b.set(bytes);return bytes.length;},{method:'HEAD',maxBodyBytes:0});
 assert.equal(result.status,200);assert.equal(result.body.length,0);assert.equal(calls,1);
});
test('HEAD rejects already-buffered actual body and does not classify it as an empty body',async()=>{
 await malformed(wire(['Content-Length: 3'],'abc'),0,'HEAD');
});
test('HEAD also rejects CL/TE ambiguity without reading either advertised body framing',async()=>{
 await malformed(wire(['Content-Length: 3','Transfer-Encoding: chunked']),0,'HEAD');
});

for(const headers of [
 ['Content-Length: 3','Transfer-Encoding: chunked'],
 ['content-length: 3','Content-Length: 3'],
 ['Content-Length: 3','CONTENT-LENGTH: 4'],
 ['Content-Length: 3, 3'],
 ['Transfer-Encoding: chunked','transfer-encoding: chunked'],
 ['Transfer-Encoding: gzip, chunked'],
 ['Transfer-Encoding: identity'],
])test('reject ambiguous/unsupported framing '+headers.join(' | '),async()=>{
 await malformed(wire(headers,'3\r\nabc\r\n0\r\n\r\n'));
});
for(const length of ['-1','+3','3.0','3e0','0x3','9007199254740992','999999999999999999999999999999999'])
 test('reject invalid or unsafe decimal Content-Length '+length,async()=>{await malformed(wire(['Content-Length: '+length],'abc'));});
for(const headers of [
 ['Content-Length : 0'],['Bad Name: x'],['X-Test: x',' folded'],['X-Test: \u0000secret'],['Content-Encoding: gzip','Content-Length: 3'],
 ['Content-Encoding: identity','Content-Encoding: identity','Content-Length: 3'],
])test('reject invalid field syntax/folding or unsupported body compression '+headers.join('|'),async()=>{
 await malformed(wire(headers,'abc'));
});
for(const status of ['HTTP/1.1 100 Continue','HTTP/1.1 101 Switching Protocols','HTTP/1.1 103 Early Hints','HTTP/2 200 OK','HTTP/1.1 2000 Wrong','HTTP/1.1 600 Wrong'])
 test('reject interim/upgrade/invalid status safely '+status,async()=>{
  await malformed(wire(['Content-Length: 0'],'',status));
 });
test('interim response cannot smuggle a later final response into this narrow parser',async()=>{
 await malformed(encode('HTTP/1.1 103 Early Hints\r\nLink: </x>\r\n\r\nHTTP/1.1 200 OK\r\nContent-Length: 0\r\n\r\n'));
});
test('bare-LF header termination and premature header EOF are errors',async()=>{
 await malformed(encode('HTTP/1.1 200 OK\nContent-Length: 0\n\n'));
 await malformed(encode('HTTP/1.1 200 OK\r\nContent-Length: 0\r\n'));
});
test('total header bytes and header-count budgets prevent unbounded accumulation',async()=>{
 await malformed(wire(['X-Large: '+'a'.repeat(17000),'Content-Length: 0']));
 await malformed(wire([...Array.from({length:140},(_,i)=>'X-'+i+': a'),'Content-Length: 0']));
});
test('early EOF for a declared body and buffered bytes beyond its end are errors',async()=>{
 await malformed(wire(['Content-Length: 4'],'abc'));
 await malformed(wire(['Content-Length: 3'],'abcd'));
 await malformed(wire(['Content-Length: 0'],'HTTP/1.1 200 OK\r\n\r\n'));
});
test('chunked framing handles fragmented size/data/CRLF/zero terminator with exact decoded bytes',async()=>{
 const result=await parse(wire(['Transfer-Encoding: chunked'],'1\r\na\r\n2\r\nbc\r\n0\r\n\r\n'),3,'POST',1);
 assert.equal(text(result.body),'abc');
});
test('chunked body with only a zero chunk is genuinely empty',async()=>{
 assert.equal((await parse(wire(['Transfer-Encoding: chunked'],'0\r\n\r\n'),0)).body.length,0);
});
test('POST accepts a single identity content coding without attempting decompression',async()=>{
 const result=await parse(wire(['Content-Length: 3','Content-Encoding: identity'],'abc'),3);
 assert.equal(text(result.body),'abc');
});
for(const frame of [
 {name:'Content-Length',bytes:wire(['Content-Length: 3'],'abc')},
 {name:'final chunk',bytes:wire(['Transfer-Encoding: chunked'],'3\r\nabc\r\n0\r\n\r\n')},
])test('complete '+frame.name+' response returns without requesting a later EOF',async()=>{
 let calls=0,lateRead=false,timer:ReturnType<typeof setTimeout>|undefined;
 const read=async(buffer:Uint8Array)=>{calls++;if(calls===1){buffer.set(frame.bytes);return frame.bytes.length;}lateRead=true;return await new Promise<number|null>(()=>{});};
 try{
  const result=await Promise.race([
   readHttp1Response(read,{method:'POST',maxBodyBytes:3}),
   new Promise<never>((_resolve,reject)=>{timer=setTimeout(()=>reject(Error('parser waited beyond complete framing')),250);}),
  ]);
  assert.equal(text(result.body),'abc');assert.equal(calls,1);assert.equal(lateRead,false);
 }finally{if(timer)clearTimeout(timer);}
});
for(const body of [
 '-1\r\nabc\r\n0\r\n\r\n',
 'G\r\nx\r\n0\r\n\r\n',
 'FFFFFFFFFFFFFFFFFFFFFFFF\r\nx\r\n0\r\n\r\n',
 '3\r\nab',
 '3\r\nabcX\n0\r\n\r\n',
 '0\r\n',
 '0\r\n\r\nEXTRA',
 '0\r\nContent-Length: 0\r\n\r\n',
 '0\r\nX-Trailer: arbitrary\r\n\r\n',
])test('reject malformed/truncated/smuggled/trailer chunk stream '+JSON.stringify(body.slice(0,36)),async()=>{
 await malformed(wire(['Transfer-Encoding: chunked'],body));
});
test('chunked decoded-body, size-line, count and encoded-overhead bounds are independent safeguards',async()=>{
 await malformed(wire(['Transfer-Encoding: chunked'],'4\r\nabcd\r\n0\r\n\r\n'),3);
 await malformed(wire(['Transfer-Encoding: chunked'],'0'.repeat(1100)+'1\r\nx\r\n0\r\n\r\n'));
 await malformed(wire(['Transfer-Encoding: chunked'],'1\r\nx\r\n'.repeat(4097)+'0\r\n\r\n'),5000);
 // Valid small chunks with valid token extensions: below line/count/decoded
 // caps individually, but aggregate framing overhead exceeds the wire budget.
 await assert.rejects(parse(wire(['Transfer-Encoding: chunked'],('1;pad='+'a'.repeat(900)+'\r\nx\r\n').repeat(120)+'0\r\n\r\n'),128),e=>e instanceof CallbackTransportError&&e.reason==='response_too_large');
});
test('zero-progress read fails instead of spinning or returning a successful empty message',async()=>{
 let calls=0;await assert.rejects(readHttp1Response(async()=>{if(++calls>8)throw Error('unsafe spin');return 0;},{method:'POST',maxBodyBytes:1}),e=>e instanceof CallbackTransportError);assert.ok(calls<=8);
});
test('malformed response errors never echo attacker-controlled header text',async()=>{
 const secret='SYNTHETIC_UNTRUSTED_HEADER_NEVER_ECHO';
 await assert.rejects(parse(wire(['Bad Name: '+secret])),error=>error instanceof CallbackTransportError&&!String(error).includes(secret));
});

test('request serializer uses origin-form, original Host and exact content length',()=>{
 const body=encode('{}');const request=serializeHttp1Request('https://receiver.openai.com/events?q=1',{'Content-Type':'application/json','webhook-id':'evt_synthetic'},body,'POST');
 const header=text(request.header);assert.ok(header.startsWith('POST /events?q=1 HTTP/1.1\r\n'));
 assert.match(header,/\r\nhost: receiver\.openai\.com\r\n/i);assert.match(header,/\r\ncontent-length: 2\r\n/i);assert.match(header,/\r\nconnection: close\r\n/i);
 assert.ok(!header.includes('POST https://'));assert.ok(header.endsWith('\r\n\r\n'));assert.deepEqual(request.body,body);
});
test('HEAD serializer never sends request data',()=>{
 const request=serializeHttp1Request('https://developers.openai.com/plugins/build/mcp-events',{},new Uint8Array(),'HEAD');
 assert.ok(text(request.header).startsWith('HEAD /plugins/build/mcp-events HTTP/1.1\r\n'));assert.equal(request.body.length,0);
 assert.throws(()=>serializeHttp1Request('https://developers.openai.com/',{},encode('x'),'HEAD'),e=>e instanceof CallbackTransportError);
});
for(const headers of [
 {'Host':'evil.invalid'},{'host':'receiver.openai.com'},{'Content-Length':'999'},{'Transfer-Encoding':'chunked'},
 {'Connection':'keep-alive'},{'Proxy-Authorization':'Basic synthetic'},{'Proxy-Connection':'keep-alive'},
 {'X-Injected':'x\r\nHost: evil.invalid'},{'Bad Header':'x'},{'X-Nul':'a\u0000b'},
] as Record<string,string>[])test('serializer rejects caller-controlled framing/proxy/invalid header '+Object.keys(headers).join(','),()=>{
 assert.throws(()=>serializeHttp1Request('https://receiver.openai.com/events',headers,encode('{}'),'POST'),e=>e instanceof CallbackTransportError);
});
test('request body size is capped before serialization',()=>{
 assert.throws(()=>serializeHttp1Request('https://receiver.openai.com/events',{},new Uint8Array(262145),'POST'),e=>e instanceof CallbackTransportError&&e.reason==='payload_too_large');
});
test('partial writes advance the actual written prefix and transmit every byte exactly once',async()=>{
 const original=encode('ABCDEFGHIJ'),observed:number[]=[];let calls=0;
 await writeAll(async bytes=>{calls++;const n=Math.min(3,bytes.length);observed.push(...bytes.subarray(0,n));return n;},original);
 assert.deepEqual(new Uint8Array(observed),original);assert.equal(calls,4);
});
test('empty write performs no I/O',async()=>{
 let calls=0;await writeAll(async()=>{calls++;return 0;},new Uint8Array());assert.equal(calls,0);
});
for(const invalid of [0,-1,0.5,NaN,Infinity,100])test('zero/invalid write progress is rejected '+String(invalid),async()=>{
 let calls=0;await assert.rejects(writeAll(async()=>{if(++calls>8)throw Error('unsafe spin');return invalid;},encode('abc')),e=>e instanceof CallbackTransportError);assert.ok(calls<=8);
});
