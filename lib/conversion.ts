import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { readFile } from 'node:fs/promises';
import type { Dataset, Year } from './types';

export const sources: {file: string; output: string; year: Year; prefix: string; subjects: string[]}[] = [
  { file: '2nd Year Attendance Database.xlsx', output: 'second_year_students.json', year: '2nd Year', prefix: 'RA25', subjects: ['DSA','COA','OS','APP'] },
  { file: '3rd Year Attendance Database.xlsx', output: 'third_year_students.json', year: '3rd Year', prefix: 'RA24', subjects: ['CN','Discrete Mathematics','ML','FLA'] },
];
function value(cell: ExcelJS.Cell): unknown {
  const v = cell.value;
  if (v && typeof v === 'object') {
    if ('result' in v) return v.result;
    if ('text' in v) return v.text;
    if ('richText' in v) return v.richText.map(t=>t.text).join('');
  }
  return v;
}
export function validateDataset(data: Dataset, expectedCount = 1000) {
  const registrations = new Set<string>(), emails = new Set<string>();
  if (data.students.length !== expectedCount || data.metadata.recordCount !== expectedCount) throw new Error(`${data.metadata.sourceFile}: expected ${expectedCount} students, found ${data.students.length}`);
  for (const [i,s] of data.students.entries()) {
    const context = `${data.metadata.sourceFile}, Excel row ${i+3}`;
    if (!s.name.trim() || !/^RA\d+$/.test(s.registrationNumber) || !s.registrationNumber.startsWith(data.metadata.registrationPrefix)) throw new Error(`${context}: invalid name or registration prefix`);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.email)) throw new Error(`${context}: invalid email`);
    if (registrations.has(s.registrationNumber)) throw new Error(`${context}: duplicate registration number`);
    if (emails.has(s.email.toLowerCase())) throw new Error(`${context}: duplicate email`);
    registrations.add(s.registrationNumber); emails.add(s.email.toLowerCase());
    if (Object.keys(s.attendance).length !== data.metadata.subjects.length) throw new Error(`${context}: unexpected subject count`);
    for (const subject of data.metadata.subjects) {
      const n = s.attendance[subject];
      if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 100) throw new Error(`${context}: ${subject} attendance must be numeric and between 0 and 100`);
    }
  }
}
export async function convertWorkbook(path: string, config: typeof sources[number], snapshotDate: string): Promise<Dataset> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(snapshotDate) || !Number.isFinite(Date.parse(snapshotDate)) || new Date(snapshotDate).toISOString().slice(0,10) !== snapshotDate) throw new Error('Snapshot date must be a valid YYYY-MM-DD date');
  // ExcelJS expects unprefixed SpreadsheetML tags; Office-generated files may
  // legally use a namespace prefix. Normalize only those tag names in memory.
  const zip = await JSZip.loadAsync(await readFile(path));
  const namespace = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  for (const file of Object.values(zip.files)) {
    if (!file.name.endsWith('.xml')) continue;
    let xml = await file.async('string');
    const declarations = [...xml.matchAll(/xmlns:([A-Za-z_][\w.-]*)=["']([^"']+)["']/g)];
    for (const [, prefix, uri] of declarations) {
      if (uri !== namespace) continue;
      const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      xml = xml.replace(new RegExp(`(<\\/?)(?:${escaped}):`, 'g'), '$1');
    }
    zip.file(file.name, xml);
  }
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await zip.generateAsync({type:'arraybuffer'}));
  if (workbook.worksheets.length !== 1) throw new Error(`${config.file}: expected one worksheet`);
  const sheet = workbook.worksheets[0];
  for (const [i,label] of ['Name','Reg. No.','Email','Attendance Percentage'].entries()) if (value(sheet.getCell(1,i+1)) !== label) throw new Error(`${config.file}: unexpected first header row`);
  for (const [i,subject] of config.subjects.entries()) if (value(sheet.getCell(2,i+4)) !== subject) throw new Error(`${config.file}: unexpected subject header ${subject}`);
  const data: Dataset = {metadata:{year:config.year,registrationPrefix:config.prefix,snapshotDate,subjects:config.subjects,recordCount:0,sourceFile:config.file,isRealTime:false},students:[]};
  for (let r=3;r<=sheet.rowCount;r++) {
    const row = sheet.getRow(r);
    if (!row.hasValues) continue;
    const cells = Array.from({length:7},(_,i)=>value(row.getCell(i+1)));
    if (cells.every(v=>v == null || v === '')) continue;
    const attendance: Record<string,number> = {};
    config.subjects.forEach((subject,i)=>{
      const v=cells[i+3];
      if ((typeof v !== 'number' && typeof v !== 'string') || String(v).trim() === '') throw new Error(`${config.file}, row ${r}: missing or invalid ${subject} attendance`);
      attendance[subject]=Number(v);
      if (!Number.isFinite(attendance[subject]) || attendance[subject]<0 || attendance[subject]>100) throw new Error(`${config.file}, row ${r}: ${subject} attendance must be numeric and between 0 and 100`);
    });
    data.students.push({name:String(cells[0]??'').trim(),registrationNumber:String(cells[1]??'').trim().toUpperCase(),email:String(cells[2]??'').trim(),attendance});
  }
  data.metadata.recordCount=data.students.length; validateDataset(data); return data;
}
