"use client";

import { useEffect } from "react";
import { mount } from "../lib/sqrap";

// Renders nothing itself: once the shell is in the DOM, the hash-driven
// renderer in lib/sqrap.js takes over the top bar, toolbar, view and lightbox.
export default function Sqrap() {
  useEffect(() => mount(), []);
  return null;
}
