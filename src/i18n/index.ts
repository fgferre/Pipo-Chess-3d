import { dictionaries, type TranslationKey } from "./dictionaries";
import type { Locale } from "../types/game";

export function t(locale: Locale, key: TranslationKey, values?: Record<string, string | number>): string {
  const source = dictionaries[locale][key] ?? dictionaries["pt-BR"][key] ?? key;

  if (!values) {
    return source;
  }

  let message = String(source);

  for (const [token, value] of Object.entries(values)) {
    message = message.replaceAll(`{${token}}`, String(value));
  }

  return message;
}

export function getLocaleLabel(locale: Locale): string {
  return dictionaries[locale][`locale.${locale}`];
}
