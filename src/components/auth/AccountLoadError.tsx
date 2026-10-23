import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
/** Unavailable data is different from a successful empty result. This UI changes no session or permissions. */
export function AccountLoadError({title='Не удалось загрузить кабинет',onRetry}:{title?:string;onRetry:()=>Promise<unknown>}){
 const[retrying,setRetrying]=useState(false);
 return <div className="min-h-screen flex items-center justify-center bg-background"><div className="flex flex-col items-center gap-4 text-center max-w-md px-6" role="alert"><p className="text-foreground font-medium">{title}</p><p className="text-muted-foreground text-sm">Данные сейчас не подтверждены. Проверьте соединение и повторите загрузку.</p><Button variant="outline" disabled={retrying} onClick={async()=>{if(retrying)return;setRetrying(true);try{await onRetry();}catch{/* The owning loader keeps the explicit failure state. */}finally{setRetrying(false);}}}><RefreshCw className={'w-4 h-4 mr-2 '+(retrying?'animate-spin':'')}/>Повторить загрузку</Button></div></div>;
}
