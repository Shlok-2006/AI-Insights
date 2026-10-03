import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import ExcelJS from 'exceljs';
import { convertWorkbook, sources, validateDataset } from '../lib/conversion';
import { calculateMetrics, getThreshold, searchStudents } from '../lib/attendance';
import { generateInsight, buildGrokRequest } from '../lib/grok';
import { studentInsight } from '../lib/service';
import { createRateLimiter } from '../lib/rate-limit';
import type { Dataset, LocatedStudent } from '../lib/types';

const datasets=await Promise.all(sources.map(s=>convertWorkbook(join(process.cwd(),s.file),s,'2026-09-10')));
const students:LocatedStudent[]=datasets.flatMap(d=>d.students.map(s=>({...s,year:d.metadata.year,snapshotDate:d.metadata.snapshotDate})));
const shlok=students.find(s=>s.registrationNumber==='RA2411026010476')!;
test('both workbooks convert their two-row merged headers and all 1,000 records',async()=>{
  for(const [i,d] of datasets.entries()) {
    assert.equal(d.students.length,1000);validateDataset(d);
    assert.equal(new Set(d.students.map(s=>s.registrationNumber)).size,1000);
    assert.equal(new Set(d.students.map(s=>s.email.toLowerCase())).size,1000);
    assert(d.students.every(s=>s.registrationNumber.startsWith(sources[i].prefix)));
    assert.deepEqual(Object.keys(d.students[0].attendance),sources[i].subjects);
    const generated=JSON.parse(await readFile(join('data',sources[i].output),'utf8')) as Dataset;
    assert.deepEqual(generated.students,d.students);
  }
  assert.equal(new Set(students.map(s=>s.registrationNumber)).size,2000);
});
test('conversion skips blank rows, converts numeric strings, and reports invalid records',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'attendance-test-'));
  try {
    const path=join(dir,'fixture.xlsx'),w=new ExcelJS.Workbook(),s=w.addWorksheet('Data');
    s.addRow(['Name','Reg. No.','Email','Attendance Percentage']);s.mergeCells('D1:G1');s.addRow([null,null,null,'DSA','COA','OS','APP']);
    for(let i=0;i<1000;i++){if(i===50)s.addRow([]);s.addRow([`Student ${i}`,`RA25${1000+i}`,`student${i}@example.com`,'75',80,90,100]);}
    await w.xlsx.writeFile(path);const result=await convertWorkbook(path,sources[0],'2026-09-10');assert.equal(result.students.length,1000);assert.equal(result.students[0].attendance.DSA,75);
    s.getCell('D3').value='invalid';await w.xlsx.writeFile(path);await assert.rejects(convertWorkbook(path,sources[0],'2026-09-10'),/row 3.*DSA/);
    s.getCell('D3').value=null;await w.xlsx.writeFile(path);await assert.rejects(convertWorkbook(path,sources[0],'2026-09-10'),/missing or invalid/);
    s.getCell('D2').value='Wrong subject';await w.xlsx.writeFile(path);await assert.rejects(convertWorkbook(path,sources[0],'2026-09-10'),/header/);
  } finally {await rm(dir,{recursive:true,force:true});}
});
test('validation rejects count, duplicates, prefixes, and out-of-range or nonnumeric attendance',()=>{
  const mutate=(fn:(d:Dataset)=>void,pattern:RegExp)=>{const d=structuredClone(datasets[0]);fn(d);assert.throws(()=>validateDataset(d),pattern);};
  mutate(d=>d.students.pop(),/expected 1000/);
  mutate(d=>d.students[1].registrationNumber=d.students[0].registrationNumber,/duplicate registration/);
  mutate(d=>d.students[1].email=d.students[0].email.toUpperCase(),/duplicate email/);
  mutate(d=>d.students[0].registrationNumber='RA241234',/prefix/);
  for(const v of [-1,101,NaN,Infinity,'75']) mutate(d=>{d.students[0].attendance.DSA=v as number;},/numeric and between/);
});
test('exact registration and email matching; automatic year; partial names and no match',()=>{
  assert(shlok);assert.equal(searchStudents(students,'ra2411026010476')[0].year,'3rd Year');
  assert.equal(searchStudents(students,shlok.email.toUpperCase())[0].registrationNumber,shlok.registrationNumber);
  assert.equal(searchStudents(students,'RA241102601').length,0);
  assert.equal(searchStudents(students,'sa8778@').length,0);
  assert(searchStudents(students,'SHLOK').some(s=>s.registrationNumber===shlok.registrationNumber));
  assert.equal(searchStudents(students,shlok.registrationNumber,'2nd Year').length,0);
  assert.equal(searchStudents(students,'zzzz-no-student').length,0);assert.equal(searchStudents(students,'').length,0);
});
test('metrics match the supplied example and handle ties, boundaries, and configurable thresholds',()=>{
  const m=calculateMetrics(shlok.attendance,75);assert.equal(m.average,82.25);assert.equal(m.highestSubject,'FLA');assert.equal(m.lowestSubject,'ML');assert.equal(m.status,'Satisfactory');assert.deepEqual(m.subjectsBelowThreshold,[]);
  assert.deepEqual(calculateMetrics({A:70.5,B:90},80).subjectsBelowThreshold,[{subject:'A',attendance:70.5,shortfall:9.5}]);
  assert.equal(calculateMetrics({A:85},75).status,'Strong');assert.equal(calculateMetrics({A:75},75).status,'Satisfactory');assert.equal(calculateMetrics({A:74.99},75).status,'Attendance Risk');
  assert.deepEqual(calculateMetrics({A:80,B:80},75).highestSubjects,['A','B']);
  assert.equal(getThreshold(''),75);assert.equal(getThreshold('80'),80);assert.throws(()=>getThreshold('101'));assert.throws(()=>getThreshold('bad'));
});
test('no matches and multiple names never call Grok; candidate response is bounded',async()=>{
  let calls=0;const generate=async()=>{calls++;return {aiInsight:'test',aiError:null};};
  assert.equal((await studentInsight(students,'not-a-student',undefined,75,generate)).kind,'error');
  const many=Array.from({length:40},(_,i)=>({...shlok,name:'Same Name',registrationNumber:`RA24${i}`}));
  const result=await studentInsight(many,'same',undefined,75,generate);assert.equal(result.kind,'candidates');if(result.kind==='candidates'){assert.equal(result.candidates.length,25);assert.equal(result.total,40);assert(!('email' in result.candidates[0]));}
  assert.equal(calls,0);
});
test('request contains only selected student, metrics and threshold; never email or database',()=>{
  const payload=buildGrokRequest(shlok,calculateMetrics(shlok.attendance,75),75,'test-model');const body=JSON.stringify(payload);
  assert.equal(payload.store,false);assert(!body.includes(shlok.email));assert(!body.includes(students[0].registrationNumber));assert(!body.includes('students'));assert(!body.includes('sourceFile'));
  assert.deepEqual(Object.keys(JSON.parse(payload.input[1].content)).sort(),['name','registrationNumber','year','snapshotDate','attendance','metrics','threshold'].sort());
});
test('Grok success parses Responses API; failures retain deterministic metrics',async()=>{
  let captured='';const fetcher:typeof fetch=async(_url,init)=>{captured=String(init?.body);return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:'Recorded snapshot analysis.'}]}]});};
  const success=await generateInsight(shlok,calculateMetrics(shlok.attendance,75),75,{apiKey:'test-only',model:'test-model',fetcher});assert.equal(success.aiInsight,'Recorded snapshot analysis.');assert(!captured.includes(shlok.email));
  for(const mock of [async()=>new Response('',{status:429}),async()=>{throw new Error('timeout');},async()=>Response.json({status:'incomplete'}),async()=>Response.json({status:'completed',output:[]})]) {
    const result=await studentInsight(students,shlok.registrationNumber,undefined,75,(s,m,t)=>generateInsight(s,m,t,{apiKey:'test-only',model:'test-model',fetcher:mock}));
    assert.equal(result.kind,'student');if(result.kind==='student'){assert.equal(result.metrics.average,82.25);assert.equal(result.aiInsight,null);assert(result.aiError);}
  }
  const missing=await generateInsight(shlok,calculateMetrics(shlok.attendance,75),75,{apiKey:'',model:''});assert.match(missing.aiError!,/not configured/);
});
test('rate limiter limits a window and resets',()=>{const allow=createRateLimiter(2,1000);assert(allow(1000));assert(allow(1001));assert(!allow(1002));assert(allow(2000));});
