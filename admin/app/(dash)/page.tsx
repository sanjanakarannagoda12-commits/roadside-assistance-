import { redirect } from 'next/navigation';

export default function Home() {
  redirect('/mechanics?status=pending_review');
}
