// src/app/sign-up/[[...sign-up]]/page.tsx
"use client";
import { SignUp } from "@clerk/nextjs";

export default function Page() {
  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "100vh" }}>
      <SignUp routing="hash" />
    </div>
  );
}
