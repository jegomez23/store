"use client";

import { useFormStatus } from "react-dom";
import { logoutAction } from "@/app/admin/(auth)/login/actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex h-11 items-center rounded-md px-3 text-sm font-medium text-gray-700 transition-colors duration-200 ease-out hover:bg-cream-dark hover:text-black disabled:cursor-not-allowed disabled:opacity-50 md:w-full"
    >
      {/* TODO(i18n) */}
      {pending ? "Saliendo…" : "Cerrar sesión"}
    </button>
  );
}

export function LogoutButton() {
  return (
    <form action={logoutAction}>
      <Submit />
    </form>
  );
}
