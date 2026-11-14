import { useEffect, useState } from 'react';
import { Paperclip,ExternalLink } from 'lucide-react';
import { resolveHomeworkFileUrl } from '@/api/homeworkFiles';

export function HomeworkAttachmentLink({attachment}: {attachment:unknown}) {
 const [url,setUrl]=useState<string|null>(null),[error,setError]=useState(false),[revision,setRevision]=useState(0);
 const name=attachment && typeof attachment==='object' && typeof (attachment as any).name==='string' ? (attachment as any).name : 'Файл';
 useEffect(()=>{let alive=true;setUrl(null);setError(false);
  void resolveHomeworkFileUrl(attachment).then(value=>{if(alive)setUrl(value);}).catch(()=>{if(alive)setError(true);});
  // Expire the displayed link before the server's five-minute signature does.
  const timer=setTimeout(()=>{if(alive){setUrl(null);setError(true);}},240000);
  return()=>{alive=false;clearTimeout(timer);};
 },[attachment,revision]);
 const classes='inline-flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-xs hover:bg-secondary/50 transition-colors';
 return url ? <a href={url} target="_blank" rel="noopener noreferrer" className={classes}><Paperclip className="w-3 h-3"/>{name}<ExternalLink className="w-3 h-3"/></a>
 : <button type="button" className={classes} disabled={!error} onClick={()=>setRevision(x=>x+1)}>{name} · {error?'Получить ссылку':'Проверяем доступ…'}</button>;
}
