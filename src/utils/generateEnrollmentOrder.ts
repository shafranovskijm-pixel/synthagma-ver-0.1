interface OrderParams {
  organizationId: string;
  organizationName: string;
  directorName?: string | null;
  directorPosition?: string | null;
  studentNames: string[];
  courseName: string;
  orderType: "enrollment" | "expulsion";
  orderDate?: Date;
}

/** @deprecated Automatic timestamp-numbered orders are disabled. Use the controlled group document workflow and register a committed private version. */
export async function generateEnrollmentOrder(_params: OrderParams): Promise<string | null> {
  throw new Error('Автоматический приказ не оформляется. Подготовьте документ в рабочем процессе группы и зарегистрируйте его сохранённую версию.');
}
