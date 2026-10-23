import Image from "next/image";

export default function GatewayOrbit() {
  return (
    <div className="angela-orbit" aria-hidden="true">
      <div className="angela-orbit-ring angela-orbit-ring-outer" />
      <div className="angela-orbit-ring angela-orbit-ring-inner" />
      <div className="angela-orbit-axis" />
      <span className="angela-orbit-spark">✳</span>
      <div className="angela-orbit-node angela-orbit-node-top"><span className="material-symbols-outlined">terminal</span><span>Your tools</span></div>
      <div className="angela-orbit-core"><Image src="/favicon.svg" width="56" height="56" alt="" /><span>angela<span className="text-primary">.</span></span></div>
      <div className="angela-orbit-node angela-orbit-node-left"><span className="material-symbols-outlined">neurology</span><span>Any model</span></div>
      <div className="angela-orbit-node angela-orbit-node-right"><span className="material-symbols-outlined">alt_route</span><span>Your routes</span></div>
      <p className="angela-orbit-caption">MANY POSSIBILITIES. ONE CONNECTION.</p>
    </div>
  );
}
