 import { useState } from "react";
 import { toast } from "sonner";
 import { format } from "date-fns";
 
 interface PersonData {
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
 
 interface GeneratorOptions {
   templateType: "prikaz" | "protokol";
   persons: PersonData[];
   groupName?: string;
   organizationName?: string;
 }
 
 // Simple XML escaping
 const escapeXml = (str: string): string => {
   return str
     .replace(/&/g, "&amp;")
     .replace(/</g, "&lt;")
     .replace(/>/g, "&gt;")
     .replace(/"/g, "&quot;")
     .replace(/'/g, "&apos;");
 };
 
 // Generate table rows for persons
 const generateTableRows = (persons: PersonData[]): string => {
   return persons
     .map(
       (person, index) => `
       <w:tr>
         <w:tc><w:p><w:r><w:t>${index + 1}</w:t></w:r></w:p></w:tc>
         <w:tc><w:p><w:r><w:t>${escapeXml(person.fullName)}</w:t></w:r></w:p></w:tc>
         <w:tc><w:p><w:r><w:t>${escapeXml(person.position || "-")}</w:t></w:r></w:p></w:tc>
         <w:tc><w:p><w:r><w:t>${escapeXml(person.organization || "-")}</w:t></w:r></w:p></w:tc>
       </w:tr>`
     )
     .join("");
 };
 
 // Generate simple numbered list
 const generatePersonsList = (persons: PersonData[]): string => {
   return persons
     .map(
       (person, index) =>
         `<w:p><w:r><w:t>${index + 1}. ${escapeXml(person.fullName)}${person.position ? ` - ${escapeXml(person.position)}` : ""}</w:t></w:r></w:p>`
     )
     .join("");
 };
 
 // Create minimal DOCX content
 const createDocxContent = (bodyContent: string): string => {
   return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
 <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
   <w:body>
     ${bodyContent}
   </w:body>
 </w:document>`;
 };
 
 export function useWordDocumentGenerator() {
   const [isGenerating, setIsGenerating] = useState(false);
 
   const generateDocument = async (options: GeneratorOptions) => {
     if (options.persons.length === 0) {
       toast.error("Выберите сотрудников для формирования документа");
       return;
     }
 
     setIsGenerating(true);
 
     try {
       const currentDate = format(new Date(), "dd.MM.yyyy");
       const groupName = options.groupName || "Группа";
       const orgName = options.organizationName || "Организация";
 
       // Generate document content based on template type
       let documentHtml = "";
       let fileName = "";
 
       if (options.templateType === "prikaz") {
         fileName = `Приказ_${format(new Date(), "yyyy-MM-dd")}.doc`;
         
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
     <p>О направлении на обучение по охране труда</p>
     <p>от ${currentDate}</p>
   </div>
   
   <p>В соответствии с требованиями Трудового кодекса РФ и Постановления Правительства РФ от 24.12.2021 № 2464 "О порядке обучения по охране труда"</p>
   
   <p><b>ПРИКАЗЫВАЮ:</b></p>
   
   <p>1. Направить на обучение по охране труда следующих работников:</p>
   
   <table>
     <tr>
       <th>№ п/п</th>
       <th>ФИО</th>
       <th>Должность</th>
       <th>Организация</th>
     </tr>
     ${options.persons
       .map(
         (person, index) => `
     <tr>
       <td>${index + 1}</td>
       <td>${escapeXml(person.fullName)}</td>
       <td>${escapeXml(person.position || "-")}</td>
       <td>${escapeXml(person.organization || orgName)}</td>
     </tr>`
       )
       .join("")}
   </table>
   
   <p>2. Программа обучения: ${escapeXml(groupName)}</p>
   
   <p>3. Контроль за исполнением приказа оставляю за собой.</p>
   
   <div class="signature">
     <p>Руководитель _________________ / ___________________ /</p>
   </div>
 </body>
 </html>`;
       } else {
         fileName = `Протокол_${format(new Date(), "yyyy-MM-dd")}.doc`;
         
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
   <h2>заседания комиссии по проверке знаний требований охраны труда</h2>
   
   <div class="header">
     <p><b>Группа:</b> ${escapeXml(groupName)}</p>
     <p><b>Дата:</b> ${currentDate}</p>
     <p><b>Организация:</b> ${escapeXml(orgName)}</p>
     <p><b>Количество слушателей:</b> ${options.persons.length}</p>
   </div>
   
   <p>Комиссия в составе:</p>
   <p>Председатель: _____________________________________________</p>
   <p>Члены комиссии: _____________________________________________</p>
   
   <p>провела проверку знаний требований охраны труда работников:</p>
   
   <table>
     <tr>
       <th>№ п/п</th>
       <th>ФИО</th>
       <th>Должность</th>
       <th>Организация</th>
       <th>Результат</th>
     </tr>
     ${options.persons
       .map(
         (person, index) => `
     <tr>
       <td>${index + 1}</td>
       <td>${escapeXml(person.fullName)}</td>
       <td>${escapeXml(person.position || "-")}</td>
       <td>${escapeXml(person.organization || orgName)}</td>
       <td>${person.isPassed !== false ? "Сдал" : "Не сдал"}</td>
     </tr>`
       )
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
 
       // Create blob and download
       const blob = new Blob([documentHtml], { type: "application/msword" });
       const url = URL.createObjectURL(blob);
       const a = document.createElement("a");
       a.href = url;
       a.download = fileName;
       document.body.appendChild(a);
       a.click();
       document.body.removeChild(a);
       URL.revokeObjectURL(url);
 
       toast.success(
         `Документ сформирован для ${options.persons.length} ${options.persons.length === 1 ? "человека" : "человек"}`
       );
     } catch (error) {
       console.error("Error generating document:", error);
       toast.error("Ошибка формирования документа");
     } finally {
       setIsGenerating(false);
     }
   };
 
   return {
     generateDocument,
     isGenerating,
   };
 }