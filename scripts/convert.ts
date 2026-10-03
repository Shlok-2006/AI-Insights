import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { convertWorkbook, sources } from '../lib/conversion';
async function main() {
  const date=process.env.SNAPSHOT_DATE ?? new Date().toISOString().slice(0,10);
  const datasets=await Promise.all(sources.map(s=>convertWorkbook(join(process.cwd(),s.file),s,date)));
  const ids=datasets.flatMap(d=>d.students.map(s=>s.registrationNumber));
  if(new Set(ids).size!==ids.length) throw new Error('Duplicate registration numbers across databases');
  await mkdir('data',{recursive:true});
  for (const [i,data] of datasets.entries()) {await writeFile(join('data',sources[i].output),JSON.stringify(data,null,2)+'\n'); console.log(`${sources[i].output}: ${data.students.length} students validated; snapshot ${date}`);}
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Conversion failed');process.exitCode=1;});
