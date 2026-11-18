"use client";

import { useSyncExternalStore } from "react";

import { readNextPath } from "@/lib/navigation";

const subscribe = () => () => {};
const getServerSnapshot = () => "/";
const getSnapshot = () => readNextPath();

export function useAuthSwitch(target: "/login" | "/register"): string {
  const nextPath = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  if (nextPath === "/") {
    return target;
  }

  return `${target}?next=${encodeURIComponent(nextPath)}`;
}
