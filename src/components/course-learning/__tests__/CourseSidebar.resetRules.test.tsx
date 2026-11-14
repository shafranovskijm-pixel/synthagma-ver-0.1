import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CourseSidebarContent } from "../CourseSidebar";
import { withCourseModuleTitles } from '@/lib/courseModuleTitles';

afterEach(cleanup);
const props = () => ({ courseTitle: "Курс", lessons: [{ id: "first", title: "Первый", type: "text" }, { id: "second", title: "Второй", type: "test" }],
  currentLessonIndex: 0, completedCount: 1, progressPercent: 50, getLessonIcon: () => null,
  isLessonCompleted: (id: string) => id === "second", isLessonAccessible: (index: number) => index === 0,
  goToLesson: vi.fn(), resetCourseProgress: vi.fn(), onNavigateBack: vi.fn() });
describe("sidebar reset and sequential access rules", () => {
  it('shows the saved module headings once and keeps canonical indexes and locks',()=>{
    const value=props();
    const lessons=withCourseModuleTitles('course-a',[{id:'first',title:'Первый',type:'practice',module_id:'m1'},{id:'second',title:'Второй',type:'test',module_id:'m1'},{id:'third',title:'Третий',type:'text',module_id:'m2'}],[{id:'m1',course_id:'course-a',title:'Моделирование'},{id:'m2',course_id:'course-a',title:'ЧПУ'}]);
    render(<CourseSidebarContent {...value} lessons={lessons} isLessonAccessible={i=>i!==1}/>);
    expect(screen.getAllByRole('heading',{name:'Моделирование'})).toHaveLength(1);expect(screen.getByRole('heading',{name:'ЧПУ'})).toBeInTheDocument();
    expect(screen.getByRole('button',{name:/Первый/})).toHaveTextContent('Практика');
    expect(screen.getByRole('button',{name:/Второй/})).toBeDisabled();
    fireEvent.click(screen.getByRole('button',{name:/Третий/}));expect(value.goToLesson).toHaveBeenCalledExactlyOnceWith(2);
  });
  it('does not display headings from another course or invent missing module titles',()=>{
    const value=props();const lessons=withCourseModuleTitles('course-a',[{id:'first',title:'Первый',type:'text',module_id:'m1'},{id:'second',title:'Второй',type:'test',module_id:null}],[{id:'m1',course_id:'foreign-course',title:'Чужая программа'}]);
    render(<CourseSidebarContent {...value} lessons={lessons}/>);
    expect(screen.queryByRole('heading',{name:'Чужая программа'})).toBeNull();expect(screen.getByRole('button',{name:/Первый/})).toBeEnabled();
  });
  it("shows a lock for an inaccessible lesson even when an earlier result is marked completed", () => {
    const value = props(); render(<CourseSidebarContent {...value} />);
    const lesson = screen.getByRole("button", { name: /Второй/ });
    expect(lesson).toBeDisabled(); expect(lesson.querySelector(".lucide-lock")).not.toBeNull();
    expect(lesson.querySelector(".lucide-circle-check-2")).toBeNull();
    fireEvent.click(lesson); expect(value.goToLesson).not.toHaveBeenCalled();
  });
  it("explains an organization reset and retained history without offering destructive learner deletion", () => {
    const value = props(); render(<CourseSidebarContent {...value} />);
    fireEvent.click(screen.getByRole("button", { name: "Как начать заново" }));
    expect(screen.getByText(/прежние попытки и результаты сохраняются в истории/)).toBeInTheDocument();
    expect(screen.queryByText(/будут удалены/)).not.toBeInTheDocument();
    expect(value.resetCourseProgress).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Обновить состояние" }));
    expect(value.resetCourseProgress).toHaveBeenCalledTimes(1);
  });
});
