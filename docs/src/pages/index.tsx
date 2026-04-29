import type { ReactNode } from "react";
import Link from "@docusaurus/Link";
import Layout from "@theme/Layout";
import HomepageFeatures from "@site/src/components/HomepageFeatures";

export default function Home(): ReactNode {
  return (
    <Layout title={`Home`} description="Documentation for martin-gomola/trip, a personal TRIP deployment fork">
      <div
        style={{
          display: "flex",
          flex: "1",
          justifyContent: "center",
          alignItems: "center",
          flexDirection: "column",
          textAlign: "center",
          background: "#f9f9f9",
        }}
      >
        <main>
          <HomepageFeatures />
        </main>
        <div className="customButtonContainer">
          <div className="customButton">
            <Link to="/docs/intro" style={{ textDecoration: "none" }}>
              <span className="customButtonSpan">🗺️ Documentation</span>
            </Link>
          </div>
        </div>
      </div>
    </Layout>
  );
}
