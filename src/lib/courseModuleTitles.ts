/** Add presentation metadata without changing the canonical lesson order or access rules. */
export function withCourseModuleTitles<T extends {module_id?:string|null}>(courseId:string,lessons:readonly T[],modules:readonly {id:string;course_id?:string|null;title?:string|null}[]):Array<T & {module_title?:string}> {
 const titles=new Map<string,string|null>();
 for(const module of modules){
  if(module.course_id!==courseId || !module.title?.trim())continue;
  titles.set(module.id,titles.has(module.id)?null:module.title.trim());
 }
 return lessons.map(lesson=>{const title=lesson.module_id?titles.get(lesson.module_id):null;return title?{...lesson,module_title:title}:lesson;});
}
