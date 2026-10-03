import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'Student Attendance AI Insights',description:'Student attendance snapshot search and insights'};
export default function Layout({children}:{children:React.ReactNode}) {return <html lang="en"><body>{children}</body></html>;}
