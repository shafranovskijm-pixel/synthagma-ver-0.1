"""Tiny dependency-free PostgreSQL SIMPLE-query test client, loopback lab only.

Trust authentication only; rejects every authentication challenge. This file
cannot connect to production or carry passwords/JWTs. It avoids repeatedly
launching Windows psql.exe while preserving the real PostgreSQL backend.
"""
import socket,struct
class NativeSqlError(RuntimeError):pass
class LabConnection:
 def __init__(self,database='rtn_npa250_lab_ci',application='npa250-main'):
  if database not in ('rtn_npa250_lab_ci','postgres'):raise ValueError('Disposable lab database only')
  self.sock=socket.create_connection(('127.0.0.1',54852),timeout=60)
  params={'user':'lab_bootstrap','database':database,'client_encoding':'UTF8','application_name':application}
  body=struct.pack('!I',196608)+b''.join(k.encode()+b'\0'+v.encode()+b'\0'for k,v in params.items())+b'\0'
  self.sock.sendall(struct.pack('!I',len(body)+4)+body)
  while True:
   tag,body=self.message()
   if tag==b'R'and body!=b'\0\0\0\0':raise RuntimeError('Lab requires trust; no password capability')
   if tag==b'E':raise NativeSqlError(self.error(body))
   if tag==b'Z':break
 def read(self,count):
  out=b''
  while len(out)<count:
   chunk=self.sock.recv(count-len(out))
   if not chunk:raise ConnectionError('Native server closed lab connection')
   out+=chunk
  return out
 def message(self):
  tag=self.read(1);size=struct.unpack('!I',self.read(4))[0]
  if not 4<=size<=64*1024*1024:raise RuntimeError('Invalid native message length')
  return tag,self.read(size-4)
 @staticmethod
 def error(body):
  fields={};offset=0
  while offset<len(body)and body[offset]:
   kind=chr(body[offset]);end=body.index(0,offset+1);fields[kind]=body[offset+1:end].decode();offset=end+1
  return '|'.join(fields.get(k,'')for k in ['C','M','D','W'])
 def query(self,sql,reset=True):
  if reset:sql='RESET ROLE;RESET request.jwt.claim.role;RESET request.jwt.claim.sub;'+sql
  data=sql.encode('utf-8')+b'\0';self.sock.sendall(b'Q'+struct.pack('!I',len(data)+4)+data)
  rows=[];error=None
  while True:
   tag,body=self.message()
   if tag==b'D':
    count=struct.unpack('!H',body[:2])[0];offset=2;values=[]
    for _ in range(count):
     size=struct.unpack('!i',body[offset:offset+4])[0];offset+=4
     values.append(''if size<0 else body[offset:offset+size].decode('utf-8'))
     if size>=0:offset+=size
    rows.append('|'.join(values))
   elif tag==b'E':error=self.error(body)
   elif tag==b'Z':break
  if error:raise NativeSqlError(error)
  return '\n'.join(rows).strip()
 def close(self):
  try:self.sock.sendall(b'X\0\0\0\4')
  except OSError:pass
  self.sock.close()
