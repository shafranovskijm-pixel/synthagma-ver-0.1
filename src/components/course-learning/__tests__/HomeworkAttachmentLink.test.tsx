import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const mock=vi.hoisted(()=>({resolve:vi.fn(),actor:'synthetic-actor',revision:1,notify:null as (()=>void)|null}));
vi.mock('@/api/homeworkFiles',()=>({resolveHomeworkFileUrl:mock.resolve}));
vi.mock('@/utils/courseCache',()=>({captureOfflineAuthRevision:()=>mock.revision,captureOfflineContext:()=>mock.actor?{actorId:mock.actor,revision:mock.revision}:null,subscribeOfflineAuthRevision:(callback:()=>void)=>{mock.notify=callback;return()=>{mock.notify=null;};}}));
import {HomeworkAttachmentLink} from '../HomeworkAttachmentLink';
beforeEach(()=>{vi.clearAllMocks();mock.actor='synthetic-actor';mock.revision=1;vi.useFakeTimers();});
afterEach(()=>{cleanup();vi.useRealTimers();});
it('does not expose a link before access is confirmed, and expires it before the signature',async()=>{
 let settle!:(v:string)=>void;mock.resolve.mockReturnValue(new Promise<string>(r=>{settle=r;}));
 render(<HomeworkAttachmentLink attachment={{name:'answer.jpg'}}/>);
 expect(screen.queryByRole('link')).toBeNull();
 await act(async()=>settle('https://synthetic.test/authorized'));
 expect(screen.getByRole('link')).toHaveAttribute('href','https://synthetic.test/authorized');
 act(()=>vi.advanceTimersByTime(240000));expect(screen.queryByRole('link')).toBeNull();
 expect(screen.getByRole('button')).toHaveTextContent('Получить ссылку');
});
it('discards an old signed URL when the displayed attachment changes',async()=>{
 let old!:(v:string)=>void;mock.resolve.mockReturnValueOnce(new Promise<string>(r=>{old=r;})).mockResolvedValueOnce('https://synthetic.test/new');
 const view=render(<HomeworkAttachmentLink attachment={{name:'old.jpg'}}/>);
 await act(async()=>view.rerender(<HomeworkAttachmentLink attachment={{name:'new.jpg'}}/>));
 await act(async()=>old('https://synthetic.test/old'));
 expect(screen.getByRole('link')).toHaveAttribute('href','https://synthetic.test/new');expect(screen.queryByText('old.jpg')).toBeNull();
});
it('offers retry after denied access and never falls back to a public URL',async()=>{
 mock.resolve.mockRejectedValueOnce(new Error('denied')).mockResolvedValueOnce('https://synthetic.test/authorized');
 await act(async()=>render(<HomeworkAttachmentLink attachment={{name:'answer.jpg',url:'homework-file:synthetic'}}/>));
 expect(screen.queryByRole('link')).toBeNull();await act(async()=>fireEvent.click(screen.getByRole('button')));
 expect(screen.getByRole('link')).toHaveAttribute('href','https://synthetic.test/authorized');
});
it('removes a signed URL immediately when the authenticated actor changes',async()=>{
 mock.resolve.mockResolvedValue('https://synthetic.test/authorized');
 await act(async()=>render(<HomeworkAttachmentLink attachment={{name:'answer.jpg'}}/>));
 expect(screen.getByRole('link')).toBeInTheDocument();
 act(()=>{mock.actor='';mock.revision++;mock.notify?.();});
 expect(screen.queryByRole('link')).toBeNull();expect(mock.resolve).toHaveBeenCalledTimes(1);
});
