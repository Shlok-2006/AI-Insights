import type { LocatedStudent, Metrics } from './types';
export function getThreshold(value = process.env.ATTENDANCE_THRESHOLD): number {
  const n=value===undefined || value===''?75:Number(value);
  if (!Number.isFinite(n) || n<0 || n>100) throw new Error('ATTENDANCE_THRESHOLD must be a number between 0 and 100');
  return n;
}
export function calculateMetrics(attendance: Record<string,number>, threshold:number): Metrics {
  const entries=Object.entries(attendance);
  if (!entries.length || entries.some(([,n])=>!Number.isFinite(n)||n<0||n>100)) throw new Error('Invalid attendance values');
  const average=Number((entries.reduce((sum,[,n])=>sum+n,0)/entries.length).toFixed(2));
  const high=Math.max(...entries.map(([,n])=>n)),low=Math.min(...entries.map(([,n])=>n));
  const highestSubjects=entries.filter(([,n])=>n===high).map(([s])=>s),lowestSubjects=entries.filter(([,n])=>n===low).map(([s])=>s);
  return {average,highestSubject:highestSubjects[0],lowestSubject:lowestSubjects[0],highestSubjects,lowestSubjects,subjectsBelowThreshold:entries.filter(([,n])=>n<threshold).map(([subject,n])=>({subject,attendance:n,shortfall:Number((threshold-n).toFixed(2))})),status:average>=85?'Strong':average>=75?'Satisfactory':'Attendance Risk'};
}
export function searchStudents(students: LocatedStudent[], query:string, year?:string): LocatedStudent[] {
  const q=query.trim().toLowerCase();
  if (!q) return [];
  return students.filter(s=>(!year||s.year===year) && (q.startsWith('ra')&&/\d/.test(q)?s.registrationNumber.toLowerCase()===q:q.includes('@')?s.email.toLowerCase()===q:s.name.toLowerCase().includes(q)));
}
