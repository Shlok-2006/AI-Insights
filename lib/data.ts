import 'server-only';
import second from '../data/second_year_students.json';
import third from '../data/third_year_students.json';
import type { Dataset, LocatedStudent } from './types';
export const students: LocatedStudent[] = ([second, third] as Dataset[]).flatMap(d => d.students.map(s => ({ ...s, year: d.metadata.year, snapshotDate: d.metadata.snapshotDate })));