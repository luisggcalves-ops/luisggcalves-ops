"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { authClient } from "@/lib/auth/client";
import { Card, CardBody, CardFooter, CardHeader } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { Button } from "@/components/ui/button";

type Msg = { tone: "success" | "error"; text: string } | null;

function Message({ msg }: { msg: Msg }) {
  if (!msg) return null;
  return (
    <p
      role={msg.tone === "error" ? "alert" : "status"}
      className={`rounded-lg px-3 py-1.5 text-[13px] ${msg.tone === "error" ? "bg-danger-bg text-danger" : "bg-success-bg text-success"}`}
    >
      {msg.text}
    </p>
  );
}

export function ProfileNameForm({ name, email }: { name: string; email: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const value = String(new FormData(e.currentTarget).get("name") ?? "").trim();
    if (value.length < 2) return setMsg({ tone: "error", text: "Please enter your name." });
    setPending(true);
    const { error } = await authClient.updateUser({ name: value });
    setPending(false);
    if (error) return setMsg({ tone: "error", text: "Couldn't save your name. Please try again." });
    setMsg({ tone: "success", text: "Saved." });
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit}>
      <Card>
        <CardHeader title="Your profile" />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" htmlFor="account-name">
            <Input id="account-name" name="name" defaultValue={name} autoComplete="name" />
          </Field>
          <Field label="Email" htmlFor="account-email" hint="Contact support to change your sign-in email.">
            <Input id="account-email" value={email} disabled readOnly />
          </Field>
        </CardBody>
        <CardFooter className="justify-between">
          <Message msg={msg} />
          <Button type="submit" disabled={pending} className="ml-auto">
            {pending ? <Loader2 className="size-4 animate-spin" /> : null} Save
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}

export function ChangePasswordForm() {
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const currentPassword = String(data.get("currentPassword") ?? "");
    const newPassword = String(data.get("newPassword") ?? "");
    if (newPassword.length < 8) return setMsg({ tone: "error", text: "Use at least 8 characters." });
    setPending(true);
    const { error } = await authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true });
    setPending(false);
    if (error) {
      return setMsg({
        tone: "error",
        text: error.code === "INVALID_PASSWORD" ? "Your current password is incorrect." : "Couldn't change your password.",
      });
    }
    form.reset();
    setMsg({ tone: "success", text: "Password changed. Other devices were signed out." });
  }

  return (
    <form onSubmit={onSubmit}>
      <Card>
        <CardHeader title="Password" description="Changing it signs you out everywhere else." />
        <CardBody className="grid gap-4 sm:grid-cols-2">
          <Field label="Current password" htmlFor="currentPassword">
            <Input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" required />
          </Field>
          <Field label="New password" htmlFor="newPassword" hint="At least 8 characters.">
            <Input id="newPassword" name="newPassword" type="password" autoComplete="new-password" required minLength={8} />
          </Field>
        </CardBody>
        <CardFooter className="justify-between">
          <Message msg={msg} />
          <Button type="submit" disabled={pending} className="ml-auto">
            {pending ? <Loader2 className="size-4 animate-spin" /> : null} Change password
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
