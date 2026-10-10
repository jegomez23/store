/**
 * Umbrales anti-abuso de `create_order` (0046, DEC-088) en los tests de
 * integración.
 *
 * Las suites crean decenas de pedidos con el MISMO teléfono en pocos segundos:
 * exactamente lo que la 0046 frena. Cada suite que crea pedidos los relaja en
 * su `before` y los RESTAURA en su `after`, que node:test ejecuta aunque un test
 * falle. Los límites que se prueban de verdad están en
 * `create-order.integration.test.ts`, que los baja a propósito.
 *
 * No es un `*.test.ts`: el glob de `npm test` no lo ejecuta, solo se importa.
 * Usa la service role key porque `settings` solo la escribe un admin, y esto es
 * preparación del escenario, nunca el camino que se está probando.
 */

export interface CheckoutLimits {
  checkout_max_orders_per_phone_hour: number;
  checkout_max_orders_per_market_10min: number;
}

interface ServiceEnv {
  url: string;
  service: string;
}

/** Suficientemente alto para que ninguna suite lo roce. */
export const RELAXED: CheckoutLimits = {
  checkout_max_orders_per_phone_hour: 10000,
  checkout_max_orders_per_market_10min: 10000,
};

function headers(env: ServiceEnv): Record<string, string> {
  return {
    apikey: env.service,
    Authorization: `Bearer ${env.service}`,
    "Content-Type": "application/json",
  };
}

/** Escribe los umbrales de un mercado. */
export async function setCheckoutLimits(
  env: ServiceEnv,
  marketId: string,
  limits: CheckoutLimits,
): Promise<void> {
  const response = await fetch(
    `${env.url}/rest/v1/settings?market_id=eq.${encodeURIComponent(marketId)}`,
    { method: "PATCH", headers: headers(env), body: JSON.stringify(limits) },
  );
  if (!response.ok) {
    throw new Error(`no se pudieron escribir los límites de ${marketId}: ${response.status}`);
  }
}

/**
 * Relaja los umbrales de TODOS los mercados y devuelve la función que deja
 * cada uno exactamente como estaba.
 */
export async function relaxCheckoutLimits(env: ServiceEnv): Promise<() => Promise<void>> {
  const response = await fetch(
    `${env.url}/rest/v1/settings?select=market_id,checkout_max_orders_per_phone_hour,checkout_max_orders_per_market_10min`,
    { headers: headers(env) },
  );
  if (!response.ok) {
    throw new Error(`no se pudieron leer los límites del checkout: ${response.status}`);
  }
  const original = (await response.json()) as (CheckoutLimits & { market_id: string })[];

  for (const row of original) {
    await setCheckoutLimits(env, row.market_id, RELAXED);
  }

  return async () => {
    for (const { market_id, ...limits } of original) {
      await setCheckoutLimits(env, market_id, limits);
    }
  };
}
