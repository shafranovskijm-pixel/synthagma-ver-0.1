import React from'react';import{source}from'../cases/factory';
export function Button({variant,size,children,...p}:any){return <button {...p}>{children}</button>;}
export function Textarea(p:any){return <textarea {...p}/>;}
export function ArchiveEvidenceField({label,onChange,disabled}:any){return <button disabled={disabled} onClick={()=>onChange({source:source(90)})}>{label}</button>;}
