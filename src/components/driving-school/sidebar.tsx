import { createContext, useContext, useState, type ReactNode } from 'react';
import { Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
const Context=createContext<{openMobile:boolean;setOpenMobile:(open:boolean)=>void}|null>(null);
export function useSidebar(){const value=useContext(Context);if(!value)throw new Error('Sidebar context required');return value;}
export function SidebarProvider({children}:{children:ReactNode}){const [openMobile,setOpenMobile]=useState(false);return <Context.Provider value={{openMobile,setOpenMobile}}><div className="driving-school-root driving-shell">{children}</div></Context.Provider>;}
export function Sidebar({children}:{children:ReactNode;collapsible?:string}){const {openMobile,setOpenMobile}=useSidebar();return <><aside className="driving-sidebar no-print">{children}</aside><Dialog open={openMobile} onOpenChange={setOpenMobile}><DialogContent className="driving-school-root driving-mobile-sidebar"><DialogTitle className="sr-only">Меню автошколы</DialogTitle><DialogDescription className="sr-only">Разделы рабочего кабинета</DialogDescription>{children}</DialogContent></Dialog></>;}
export const SidebarHeader=({children}:{children:ReactNode})=><div className="driving-sidebar-header">{children}</div>;
export const SidebarContent=({children}:{children:ReactNode})=><nav className="driving-sidebar-content" aria-label="Разделы автошколы">{children}</nav>;
export const SidebarFooter=({children}:{children:ReactNode})=><div className="driving-sidebar-footer">{children}</div>;
export const SidebarInset=({children,className}:{children:ReactNode;className?:string})=><section className={className}>{children}</section>;
export function SidebarTrigger(props:React.ComponentProps<typeof Button>){const {setOpenMobile}=useSidebar();return <Button {...props} className="driving-menu-trigger" variant="ghost" onClick={()=>setOpenMobile(true)}><Menu/></Button>;}
