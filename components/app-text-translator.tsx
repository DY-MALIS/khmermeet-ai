"use client";

import { useEffect } from "react";
import { enToKmText, kmToEnText, type AppLanguage } from "@/lib/app-translations";
import { languageChangeEvent, languageStorageKey, readDisplayLanguage } from "@/lib/display-language";

const ignoredTextTags = new Set(["SCRIPT", "STYLE", "TEXTAREA", "INPUT", "CODE", "PRE", "NOSCRIPT", "SVG"]);
const ignoredAttributeTags = new Set(["SCRIPT", "STYLE", "TEXTAREA", "CODE", "PRE", "NOSCRIPT", "SVG"]);
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
  return translated ? preserveWhitespace(value, translated) : value;
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
  useEffect(() => {
    let frame = 0;

    const apply = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => translateApp(readDisplayLanguage()));
    };

    apply();

    const observer = new MutationObserver((mutations) => {
      if (mutations.some((mutation) => mutation.type === "childList" || mutation.type === "characterData")) apply();
    });
    observer.observe(document.body, { childList: true, characterData: true, subtree: true });

    const onLanguageChange = () => apply();
    const onStorage = (event: StorageEvent) => {
      if (event.key === languageStorageKey) apply();
    };
    window.addEventListener(languageChangeEvent, onLanguageChange);
    window.addEventListener("storage", onStorage);

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener(languageChangeEvent, onLanguageChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return null;
}
