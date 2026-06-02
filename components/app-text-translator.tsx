"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { enToKmText, kmToEnText, phraseTranslationKeys, type AppLanguage } from "@/lib/app-translations";
import { languageChangeEvent, languageStorageKey, readDisplayLanguage } from "@/lib/display-language";

const ignoredTextTags = new Set(["SCRIPT", "STYLE", "TEXTAREA", "INPUT", "CODE", "PRE", "NOSCRIPT", "SVG"]);
const ignoredAttributeTags = new Set(["SCRIPT", "STYLE", "CODE", "PRE", "NOSCRIPT", "SVG"]);
const translatedAttributes = ["placeholder", "aria-label", "title"] as const;

function preserveWhitespace(source: string, next: string) {
  const leading = source.match(/^\s*/)?.[0] ?? "";
  const trailing = source.match(/\s*$/)?.[0] ?? "";
  return `${leading}${next}${trailing}`;
}

function shouldSkip(element: Element | null) {
  if (!element) return false;
  return Boolean(element.closest("[data-no-translate]"));
}

function translateValue(value: string, language: AppLanguage) {
  const dictionary = language === "en" ? kmToEnText : enToKmText;
  const trimmed = value.trim();
  const translated = dictionary[trimmed];
  if (translated) return preserveWhitespace(value, translated);

  const phraseKeys = language === "en" ? phraseTranslationKeys : phraseTranslationKeys.map((key) => kmToEnText[key]).filter(Boolean);
  const replacementKeys = Array.from(new Set([...phraseKeys, ...Object.keys(dictionary).filter((key) => key.length >= 3)]))
    .sort((a, b) => b.length - a.length);
  const replaced = replacementKeys.reduce((current, key) => {
    const next = dictionary[key];
    return next ? current.split(key).join(next) : current;
  }, value);
  return replaced;
}

function translateTextNodes(root: ParentNode, language: AppLanguage) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent || ignoredTextTags.has(parent.tagName) || shouldSkip(parent)) return NodeFilter.FILTER_REJECT;
      return node.textContent?.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    }
  });

  const nodes: Text[] = [];
  let current = walker.nextNode();
  while (current) {
    nodes.push(current as Text);
    current = walker.nextNode();
  }

  nodes.forEach((node) => {
    const currentText = node.textContent ?? "";
    const nextText = translateValue(currentText, language);
    if (nextText !== currentText) node.textContent = nextText;
  });
}

function translateAttributes(root: ParentNode, language: AppLanguage) {
  const elements = root instanceof Element ? [root, ...Array.from(root.querySelectorAll("*"))] : Array.from(root.querySelectorAll("*"));
  elements.forEach((element) => {
    if (ignoredAttributeTags.has(element.tagName) || shouldSkip(element)) return;
    translatedAttributes.forEach((attribute) => {
      const current = element.getAttribute(attribute);
      if (!current) return;
      const next = translateValue(current, language);
      if (next !== current) element.setAttribute(attribute, next);
    });
  });
}

function translateApp(language: AppLanguage) {
  document.documentElement.lang = language;
  translateTextNodes(document.body, language);
  translateAttributes(document.body, language);
}

export function AppTextTranslator() {
  const pathname = usePathname();

  useEffect(() => {
    let frame = 0;
    let timers: number[] = [];

    const apply = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => translateApp(readDisplayLanguage()));
    };

    const applySoon = () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      timers = [0, 80, 250, 700].map((delay) => window.setTimeout(apply, delay));
    };

    applySoon();

    const observer = new MutationObserver((mutations) => {
      if (mutations.some((mutation) => mutation.type === "childList" || mutation.type === "characterData" || mutation.type === "attributes")) applySoon();
    });
    observer.observe(document.body, {
      attributeFilter: [...translatedAttributes],
      attributes: true,
      childList: true,
      characterData: true,
      subtree: true
    });

    const onLanguageChange = () => applySoon();
    const onStorage = (event: StorageEvent) => {
      if (event.key === languageStorageKey) apply();
    };
    window.addEventListener(languageChangeEvent, onLanguageChange);
    window.addEventListener("storage", onStorage);

    return () => {
      window.cancelAnimationFrame(frame);
      timers.forEach((timer) => window.clearTimeout(timer));
      observer.disconnect();
      window.removeEventListener(languageChangeEvent, onLanguageChange);
      window.removeEventListener("storage", onStorage);
    };
  }, [pathname]);

  return null;
}
