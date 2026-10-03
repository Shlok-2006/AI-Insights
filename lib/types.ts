export type Year = '2nd Year' | '3rd Year';
export interface Student { name: string; registrationNumber: string; email: string; attendance: Record<string, number> }
export interface Dataset { metadata: { year: Year; registrationPrefix: string; snapshotDate: string; subjects: string[]; recordCount: number; sourceFile: string; isRealTime: false }; students: Student[] }
export type LocatedStudent = Student & { year: Year; snapshotDate: string };
export interface Metrics { average: number; highestSubject: string; lowestSubject: string; highestSubjects: string[]; lowestSubjects: string[]; subjectsBelowThreshold: { subject: string; attendance: number; shortfall: number }[]; status: 'Strong' | 'Satisfactory' | 'Attendance Risk' }
export interface InsightResult { kind: 'student'; student: LocatedStudent; metrics: Metrics; threshold: number; aiInsight: string | null; aiError: string | null; snapshotDate: string; isRealTime: false }
export type SearchResponse = InsightResult | { kind: 'candidates'; candidates: Pick<LocatedStudent,'name'|'registrationNumber'|'year'>[]; total: number } | { kind: 'error'; error: string };
