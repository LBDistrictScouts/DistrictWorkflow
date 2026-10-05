"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const links = [
  { href: "/", label: "Overview" },
  { href: "/workflows", label: "Workflows" },
  { href: "/help", label: "Help & guidance" },
];

export default function Navigation() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  function toggleTheme() {
    const root = document.documentElement;
    const current = root.dataset.theme ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const theme = current === "dark" ? "light" : "dark";
    root.dataset.theme = theme;
    try { localStorage.setItem("district-workflow-theme", theme); } catch { /* Theme still works when storage is unavailable. */ }
  }

  return (
    <header className="site-header">
      <nav className="nav-inner" aria-label="Main navigation">
        <Link href="/" className="brand" aria-label="LBA Scouts District Workflow home" onClick={() => setOpen(false)}>
          <Image className="logo-light" src="/images/logos/lba-navy-linear.png" alt="" width={156} height={71} priority />
          <Image className="logo-dark" src="/images/logos/lba-white-linear.png" alt="" width={156} height={71} priority />
          <span className="brand-product">District<br /><strong>Workflow</strong></span>
        </Link>
        <button className="menu-button" type="button" aria-expanded={open} aria-controls="navigation-links" onClick={() => setOpen(!open)}>{open ? "Close" : "Menu"}</button>
        <div id="navigation-links" className={`nav-links ${open ? "is-open" : ""}`}>
          {links.map(({ href, label }) => <Link key={href} href={href} aria-current={(href === "/" ? pathname === href : pathname.startsWith(href)) ? "page" : undefined} onClick={() => setOpen(false)}>{label}</Link>)}
        </div>
        <button type="button" className="theme-button" aria-label="Toggle colour theme" onClick={toggleTheme}>
          <span className="logo-light" aria-hidden="true">☾</span><span className="logo-dark" aria-hidden="true">☀</span>
        </button>
      </nav>
    </header>
  );
}
