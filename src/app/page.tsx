import Link from "next/link";

export default function Home() {
  return (
    <main style={{ padding: 24 }}>
      <h1>Biz Math</h1>
      <ul style={{ marginTop: 12 }}>
        <li><Link href="/sign-in">Sign in</Link></li>
        <li><Link href="/sign-up">Sign up</Link></li>
        <li><Link href="/dashboard">Dashboard (protected)</Link></li>
      </ul>
    </main>
  );
}
