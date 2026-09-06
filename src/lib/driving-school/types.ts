export type WindowSlot = { id: string; start: string; end: string };
export type Question = { text: string; options: string[]; correct?: number };
type Shapes = {
  student: {
    email: string;
    phone: string;
    programId: string;
    groupId: string | null;
    instructorId: string | null;
    practiceMinutes: number;
    transmission: string;
  };
  instructor: { email?: string; carId: string; windows: WindowSlot[] };
  car: { number: string; transmission: string; category: string };
  group: { programId: string };
  program: {
    version: string;
    transmission: string;
    practiceMinutes: number;
    category: string;
  };
  course: {
    programId: string;
    material: string;
    passPercent: number;
    questions: Question[];
  };
};
export type Kind = keyof Shapes;
export type Row<K extends Kind = Kind> = {
  [P in K]: {
    id: string;
    kind: P;
    name: string;
    active: number;
    data: Shapes[P];
  };
}[K];
type EntryShapes = {
  charge: { kopecks: number; note: string; date: string };
  payment: { kopecks: number; note: string; date: string };
  exam: {
    date: string;
    examType: string;
    result: string;
    protocol: string;
    note: string;
  };
  attempt: {
    courseId: string;
    courseName: string;
    score: number;
    passed: boolean;
    answers: number[];
  };
};
export type Entry = {
  [P in keyof EntryShapes]: {
    id: string;
    student_id: string;
    kind: P;
    created: number;
    data: EntryShapes[P];
    reversal: { reason: string; created: number } | null;
  };
}[keyof EntryShapes];
export type Lesson = { id: string; student_id: string; instructor_id: string; car_id: string; start: number; end: number; status: string; actual_minutes: number; topic: string; note: string };
export type State = {
 user: { id: string; name: string; email: string; role: 'owner' | 'student' | 'instructor'; resource_id: string };
 school: { id: string; name: string; settings: string };
 resources: Row[]; lessons: Lesson[]; entries: Entry[];
 balances: { id: string; completed: number; reserved: number; planned: number }[];
 busy: { start: number; end: number }[];
 audit: { action: string; target: string; created: number; detail: string }[];
};
export type DrivingAdapter = {
 canCreateStudents?: boolean;
 load: () => Promise<State>;
 mutate: (path: string, payload: Record<string, unknown>, state: State) => Promise<Record<string, unknown>>;
};

