import { calculateMetrics, searchStudents } from './attendance';
import { generateInsight } from './grok';
import type { LocatedStudent, SearchResponse } from './types';
export async function studentInsight(students:LocatedStudent[],query:string,year:string|undefined,threshold:number,generate=generateInsight): Promise<SearchResponse> {
  const matches=searchStudents(students,query,year);
  if (!matches.length) return {kind:'error',error:'No student found. Check the registration number, email, or name.'};
  if(matches.length>1) return {kind:'candidates',total:matches.length,candidates:matches.slice(0,25).map(({name,registrationNumber,year})=>({name,registrationNumber,year}))};
  const student=matches[0],metrics=calculateMetrics(student.attendance,threshold);
  const insight=await generate(student,metrics,threshold);
  return {kind:'student',student,metrics,threshold,...insight,snapshotDate:student.snapshotDate,isRealTime:false};
}
