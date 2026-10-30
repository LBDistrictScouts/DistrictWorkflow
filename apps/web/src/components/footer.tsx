import Image from "next/image";
import Link from "next/link";

export default function Footer() {
  return <footer className="site-footer">
    <div className="container footer-main">
      <Image src="/images/logos/lba-white-linear.png" alt="Letchworth, Baldock & Ashwell Scouts" width={176} height={80} />
      <p>A little less admin.<br /><strong>More time for #SkillsForLife.</strong></p>
      <Link href="/help">Help & guidance <span aria-hidden="true">↗</span></Link>
    </div>
    <div className="container footer-bottom"><span>© {new Date().getFullYear()} Letchworth, Baldock &amp; Ashwell Scouts.</span><span>District Workflow</span></div>
  </footer>;
}
