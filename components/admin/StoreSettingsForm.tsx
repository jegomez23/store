"use client";

import { useActionState } from "react";
import { Feedback, Field, SubmitButton, TextInput } from "@/components/admin/FormBits";
import { SETTINGS_LIMITS } from "@/lib/admin/content";
import {
  updateStoreSettingsAction,
  type SettingsActionState,
} from "@/app/admin/(panel)/ajustes/actions";
import type { AdminSettingsFull } from "@/lib/data/admin/cms";

/**
 * Ajustes de tienda: nombre, email de contacto y redes.
 *
 * El número de WhatsApp tiene su propio formulario y su propia action a
 * propósito: es la única fuente de verdad del checkout y conviene que
 * cambiarlo sea un acto separado y visible (rules/backend.md #15).
 */

const INITIAL: SettingsActionState = { error: null, success: null };

export function StoreSettingsForm({ settings }: { settings: AdminSettingsFull }) {
  const [state, formAction] = useActionState(updateStoreSettingsAction, INITIAL);

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-md border border-line bg-white p-4">
      {/* TODO(i18n) en todo el formulario */}
      <h2 className="text-sm font-medium text-black">Datos de la tienda</h2>

      <Field label="Nombre de la tienda" name="storeName">
        <TextInput
          name="storeName"
          defaultValue={settings.storeName}
          required
          maxLength={SETTINGS_LIMITS.storeName}
        />
      </Field>

      <Field label="Email de contacto" name="contactEmail">
        <TextInput
          name="contactEmail"
          type="email"
          inputMode="email"
          defaultValue={settings.contactEmail ?? ""}
          maxLength={SETTINGS_LIMITS.email}
        />
      </Field>

      <Field label="Instagram" name="instagramUrl" hint="URL completa https://…">
        <TextInput
          name="instagramUrl"
          type="url"
          inputMode="url"
          defaultValue={settings.instagramUrl ?? ""}
          placeholder="https://instagram.com/yi"
          hint
        />
      </Field>

      <Field label="TikTok" name="tiktokUrl">
        <TextInput
          name="tiktokUrl"
          type="url"
          inputMode="url"
          defaultValue={settings.tiktokUrl ?? ""}
          placeholder="https://tiktok.com/@yi"
        />
      </Field>

      <Field label="Facebook" name="facebookUrl">
        <TextInput
          name="facebookUrl"
          type="url"
          inputMode="url"
          defaultValue={settings.facebookUrl ?? ""}
          placeholder="https://facebook.com/yi"
        />
      </Field>

      <Feedback state={state} />

      <div>
        <SubmitButton label="Guardar ajustes" />
      </div>
    </form>
  );
}
