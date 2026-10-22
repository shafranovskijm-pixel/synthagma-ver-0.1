import { format } from "date-fns";
import { escapeXml } from "@/lib/docx/htmlToDocx";
export interface PersonData {
    fullName: string;
    position?: string;
    organization?: string;
    snils?: string;
    inn?: string;
    protocolNumber?: string;
    programName?: string;
    examDate?: string;
    isPassed?: boolean;
}
export interface GeneratorOptions {
    templateType: "prikaz" | "protokol";
    persons: PersonData[];
    groupName?: string;
    organizationName?: string;
    purpose?: "labor_safety" | "enrollment";
}
/** Editable draft; this does not issue, sign, register, or infer an assessment. */
export function buildWordDocument(options: GeneratorOptions, now = new Date()): {
    html: string;
    fileName: string;
} {
    if (!options.persons.length)
        throw new Error("Выберите людей для формирования документа");
    const currentDate = format(now, "dd.MM.yyyy");
    const groupName = options.groupName || "Группа";
    const orgName = options.organizationName || "Организация";
    // Generate document content based on template type
    let documentHtml = "";
    let fileName = "";
    if (options.templateType === "prikaz") {
        fileName = `Приказ_${format(now, "yyyy-MM-dd")}.docx`;
        documentHtml = `
 <!DOCTYPE html>
 <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
 <head>
   <meta charset="UTF-8">
   <style>
     body { font-family: 'Times New Roman', serif; font-size: 14pt; }
     h1 { text-align: center; font-size: 16pt; font-weight: bold; }
     h2 { text-align: center; font-size: 14pt; font-weight: normal; }
     .header { text-align: right; margin-bottom: 40px; }
     .title { text-align: center; margin: 30px 0; }
     table { width: 100%; border-collapse: collapse; margin: 20px 0; }
     td, th { border: 1px solid black; padding: 8px; }
     th { background-color: #f0f0f0; }
     .footer { margin-top: 60px; }
     .signature { margin-top: 40px; }
   </style>
 </head>
 <body>
   <div class="header">
     <p>${escapeXml(orgName)}</p>
   </div>
   
   <div class="title">
     <h1>ПРИКАЗ</h1>
     <p>${options.purpose === "enrollment" ? "О зачислении на обучение (проект)" : "О направлении на обучение по охране труда (проект)"}</p>
     <p>от ${currentDate}</p>
   </div>
   
   <p>Основание: ___________________ (заполняет уполномоченный сотрудник организации).</p>
   
   <p><b>ПРИКАЗЫВАЮ:</b></p>
   
   <p>1. ${options.purpose === "enrollment" ? "Зачислить на обучение следующих слушателей" : "Направить на обучение по охране труда следующих работников"}:</p>
   
   <table>
     <tr>
       <th>№ п/п</th>
       <th>ФИО</th>
       <th>Должность</th>
       <th>Организация</th>
     </tr>
     ${options.persons
            .map((person, index) => `
     <tr>
       <td>${index + 1}</td>
       <td>${escapeXml(person.fullName)}</td>
       <td>${escapeXml(person.position || "-")}</td>
       <td>${escapeXml(person.organization || orgName)}</td>
     </tr>`)
            .join("")}
   </table>
   
   <p>2. Программа обучения: ${escapeXml(groupName)}</p>
   
   <p>3. Контроль за исполнением приказа оставляю за собой.</p>
   
   <div class="signature">
     <p>Руководитель _________________ / ___________________ /</p>
   </div>
 </body>
 </html>`;
    }
    else {
        fileName = `Протокол_${format(now, "yyyy-MM-dd")}.docx`;
        documentHtml = `
 <!DOCTYPE html>
 <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
 <head>
   <meta charset="UTF-8">
   <style>
     body { font-family: 'Times New Roman', serif; font-size: 14pt; }
     h1 { text-align: center; font-size: 16pt; font-weight: bold; }
     h2 { text-align: center; font-size: 14pt; font-weight: normal; }
     .header { margin-bottom: 20px; }
     table { width: 100%; border-collapse: collapse; margin: 20px 0; }
     td, th { border: 1px solid black; padding: 8px; }
     th { background-color: #f0f0f0; }
     .footer { margin-top: 40px; }
     .signatures { margin-top: 60px; }
   </style>
 </head>
 <body>
   <h1>ПРОТОКОЛ</h1>
   <h2>${options.purpose === "enrollment" ? "результатов обучения (проект)" : "заседания комиссии по проверке знаний требований охраны труда (проект)"}</h2>
   
   <div class="header">
     <p><b>Группа:</b> ${escapeXml(groupName)}</p>
     <p><b>Дата:</b> ${currentDate}</p>
     <p><b>Организация:</b> ${escapeXml(orgName)}</p>
     <p><b>Количество слушателей:</b> ${options.persons.length}</p>
   </div>
   
   <p>Комиссия в составе:</p>
   <p>Председатель: _____________________________________________</p>
   <p>Члены комиссии: _____________________________________________</p>
   
   <p>${options.purpose === "enrollment" ? "Сведения о результатах слушателей" : "провела проверку знаний требований охраны труда работников"}:</p>
   
   <table>
     <tr>
       <th>№ п/п</th>
       <th>ФИО</th>
       <th>Должность</th>
       <th>Организация</th>
       <th>Результат</th>
     </tr>
     ${options.persons
            .map((person, index) => `
     <tr>
       <td>${index + 1}</td>
       <td>${escapeXml(person.fullName)}</td>
       <td>${escapeXml(person.position || "-")}</td>
       <td>${escapeXml(person.organization || orgName)}</td>
       <td>${person.isPassed === true ? "Сдал" : person.isPassed === false ? "Не сдал" : "Результат не указан"}</td>
     </tr>`)
            .join("")}
   </table>
   
   <div class="signatures">
     <p>Председатель комиссии: _________________ / ___________________ /</p>
     <br/>
     <p>Члены комиссии:</p>
     <p>1. _________________ / ___________________ /</p>
     <p>2. _________________ / ___________________ /</p>
     <p>3. _________________ / ___________________ /</p>
   </div>
 </body>
 </html>`;
    }
    return { html: documentHtml, fileName };
}
