import { useState, type CSSProperties, type ElementType } from "react";
import SiAirtable from "@icons-pack/react-simple-icons/icons/SiAirtable";
import SiAsana from "@icons-pack/react-simple-icons/icons/SiAsana";
import SiBox from "@icons-pack/react-simple-icons/icons/SiBox";
import SiCalendly from "@icons-pack/react-simple-icons/icons/SiCalendly";
import SiClerk from "@icons-pack/react-simple-icons/icons/SiClerk";
import SiCloudflare from "@icons-pack/react-simple-icons/icons/SiCloudflare";
import SiCloudinary from "@icons-pack/react-simple-icons/icons/SiCloudinary";
import SiDiscord from "@icons-pack/react-simple-icons/icons/SiDiscord";
import SiDropbox from "@icons-pack/react-simple-icons/icons/SiDropbox";
import SiExcalidraw from "@icons-pack/react-simple-icons/icons/SiExcalidraw";
import SiFigma from "@icons-pack/react-simple-icons/icons/SiFigma";
import SiGmail from "@icons-pack/react-simple-icons/icons/SiGmail";
import SiGoogle from "@icons-pack/react-simple-icons/icons/SiGoogle";
import SiGooglemaps from "@icons-pack/react-simple-icons/icons/SiGooglemaps";
import SiGrafana from "@icons-pack/react-simple-icons/icons/SiGrafana";
import SiHubspot from "@icons-pack/react-simple-icons/icons/SiHubspot";
import SiHuggingface from "@icons-pack/react-simple-icons/icons/SiHuggingface";
import SiJira from "@icons-pack/react-simple-icons/icons/SiJira";
import SiLinear from "@icons-pack/react-simple-icons/icons/SiLinear";
import SiMailtrap from "@icons-pack/react-simple-icons/icons/SiMailtrap";
import SiMake from "@icons-pack/react-simple-icons/icons/SiMake";
import SiMermaid from "@icons-pack/react-simple-icons/icons/SiMermaid";
import SiMetabase from "@icons-pack/react-simple-icons/icons/SiMetabase";
import SiMiro from "@icons-pack/react-simple-icons/icons/SiMiro";
import SiNetlify from "@icons-pack/react-simple-icons/icons/SiNetlify";
import SiNotion from "@icons-pack/react-simple-icons/icons/SiNotion";
import SiOkta from "@icons-pack/react-simple-icons/icons/SiOkta";
import SiPaypal from "@icons-pack/react-simple-icons/icons/SiPaypal";
import SiResend from "@icons-pack/react-simple-icons/icons/SiResend";
import SiSquare from "@icons-pack/react-simple-icons/icons/SiSquare";
import SiStripe from "@icons-pack/react-simple-icons/icons/SiStripe";
import SiSupabase from "@icons-pack/react-simple-icons/icons/SiSupabase";
import SiTldraw from "@icons-pack/react-simple-icons/icons/SiTldraw";
import SiVercel from "@icons-pack/react-simple-icons/icons/SiVercel";
import SiZendesk from "@icons-pack/react-simple-icons/icons/SiZendesk";
import {
  Box as BoxIcon,
  BriefcaseBusiness,
  CalendarDays,
  ChartNoAxesCombined,
  Cloud,
  Database,
  FileText,
  Mail,
  MessageSquare,
  PlugZap,
  Search,
  ShieldCheck,
  SquareCheckBig,
  Users,
  Workflow,
  type LucideIcon,
} from "lucide-react";

const CONNECTOR_ICON_DOMAINS: Record<string, string> = {
  agentmail: "agentmail.to",
  ahrefs: "ahrefs.com",
  aiera: "aiera.com",
  airtable: "airtable.com",
  amplitude: "amplitude.com",
  asana: "asana.com",
  attio: "attio.com",
  box: "box.com",
  calcom: "cal.com",
  chronograph: "chronograph.pe",
  clerk: "clerk.com",
  "clinical-trials": "clinicaltrials.gov",
  cloudflare: "cloudflare.com",
  cloudinary: "cloudinary.com",
  daloopa: "daloopa.com",
  discord: "discord.com",
  drafts: "getdrafts.com",
  dropbox: "dropbox.com",
  egnyte: "egnyte.com",
  excalidraw: "excalidraw.com",
  factset: "factset.com",
  fantastical: "flexibits.com",
  figma: "figma.com",
  gmail: "gmail.com",
  googleworkspace: "gmail.com",
  "google-workspace": "workspace.google.com",
  grafana: "grafana.com",
  growthbook: "growthbook.io",
  honeycomb: "honeycomb.io",
  hubspot: "hubspot.com",
  huggingface: "huggingface.co",
  jira: "atlassian.com",
  linear: "linear.app",
  lseg: "lseg.com",
  mailtrap: "mailtrap.io",
  make: "make.com",
  maps: "google.com",
  mem: "mem.ai",
  mermaid: "mermaidchart.com",
  "mermaid-chart": "mermaidchart.com",
  metabase: "metabase.com",
  miro: "miro.com",
  monday: "monday.com",
  moodys: "moodys.com",
  morningstar: "morningstar.com",
  mtnewswires: "mtnewswires.com",
  netlify: "netlify.com",
  notion: "notion.so",
  okta: "okta.com",
  onedrive: "onedrive.live.com",
  paypal: "paypal.com",
  pitchbook: "pitchbook.com",
  resend: "resend.com",
  salesforce: "salesforce.com",
  servicenow: "servicenow.com",
  shadcn: "ui.shadcn.com",
  "shadcn-ui": "ui.shadcn.com",
  sharepoint: "sharepoint.com",
  smartsheet: "smartsheet.com",
  socket: "socket.dev",
  spglobal: "spglobal.com",
  square: "squareup.com",
  stripe: "stripe.com",
  supabase: "supabase.com",
  tavily: "tavily.com",
  tldraw: "tldraw.com",
  tomba: "tomba.io",
  vercel: "vercel.com",
  zendesk: "zendesk.com",
};

function SharePointBrand({ size = 24 }: { size?: string | number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="14.5" cy="7" r="4" fill="#038387" />
      <circle cx="17.8" cy="13.7" r="3.2" fill="#1a9ba1" />
      <circle cx="13.2" cy="17" r="4.2" fill="#37c6d0" />
      <rect x="2" y="4.5" width="11.5" height="15" rx="2" fill="#036c70" />
      <text
        x="7.75"
        y="15.4"
        fill="#fff"
        fontSize="10"
        fontWeight="700"
        textAnchor="middle"
      >
        S
      </text>
    </svg>
  );
}

function OneDriveBrand({ size = 24 }: { size?: string | number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M9.4 8.3a5.1 5.1 0 0 1 9.1 2.3 4.2 4.2 0 0 1 1 8.3H6.2a4.8 4.8 0 0 1 3.2-10.6Z"
        fill="#0078d4"
      />
      <path
        d="M6.2 18.9a4.8 4.8 0 0 1 3.2-10.6 5.1 5.1 0 0 1 4.3 2.4 4.3 4.3 0 0 0-7.5 8.2Z"
        fill="#1490df"
      />
    </svg>
  );
}

function AgentMailBrand({ size = 24 }: { size?: string | number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M3 6.5A2.5 2.5 0 0 1 5.5 4h13A2.5 2.5 0 0 1 21 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5Z"
        fill="#ff5a1f"
      />
      <path
        d="m5 7 7 5.4L19 7"
        fill="none"
        stroke="#fff"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="m9.1 17 2.9-7 2.9 7M10.3 14.5h3.4"
        fill="none"
        stroke="#fff"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SmartsheetBrand({ size = 24 }: { size?: string | number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 3h16v18H4z" rx="2" fill="#22a657" />
      <path
        d="M8 8h8M8 12h8M8 16h4"
        stroke="#fff"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="m14.5 16 1.6 1.6 3.1-3.5"
        fill="none"
        stroke="#fff"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SalesforceBrand({ size = 24 }: { size?: string | number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M8.4 18.8H18a4 4 0 0 0 .6-8A5.2 5.2 0 0 0 8.8 8a4.6 4.6 0 0 0-.4 10.8Z"
        fill="#0d9dda"
      />
      <text
        x="12.7"
        y="15"
        fill="#fff"
        fontSize="4.4"
        fontWeight="700"
        textAnchor="middle"
      >
        salesforce
      </text>
    </svg>
  );
}

function ServiceNowBrand({ size = 24 }: { size?: string | number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 3a9 9 0 1 0 6.9 14.8L16.3 15A5.5 5.5 0 1 1 17.5 12h3.6A9 9 0 0 0 12 3Z"
        fill="#62d84e"
      />
      <circle cx="12" cy="12" r="2.1" fill="#1b3328" />
    </svg>
  );
}

function MondayBrand({ size = 24 }: { size?: string | number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect
        x="4"
        y="4"
        width="4"
        height="13"
        rx="2"
        fill="#ff3d57"
        transform="rotate(28 6 10.5)"
      />
      <rect
        x="10"
        y="4"
        width="4"
        height="13"
        rx="2"
        fill="#ffcb00"
        transform="rotate(28 12 10.5)"
      />
      <circle cx="18.2" cy="15.8" r="2.2" fill="#00ca72" />
    </svg>
  );
}

const LOCAL_BRAND_ICONS: Record<string, ElementType> = {
  agentmail: AgentMailBrand,
  airtable: SiAirtable,
  asana: SiAsana,
  box: SiBox,
  calcom: SiCalendly,
  clerk: SiClerk,
  cloudflare: SiCloudflare,
  cloudinary: SiCloudinary,
  discord: SiDiscord,
  dropbox: SiDropbox,
  excalidraw: SiExcalidraw,
  figma: SiFigma,
  gmail: SiGmail,
  googleworkspace: SiGmail,
  "google-workspace": SiGoogle,
  grafana: SiGrafana,
  hubspot: SiHubspot,
  huggingface: SiHuggingface,
  jira: SiJira,
  linear: SiLinear,
  mailtrap: SiMailtrap,
  make: SiMake,
  maps: SiGooglemaps,
  "mermaid-chart": SiMermaid,
  mermaid: SiMermaid,
  metabase: SiMetabase,
  miro: SiMiro,
  monday: MondayBrand,
  netlify: SiNetlify,
  notion: SiNotion,
  okta: SiOkta,
  onedrive: OneDriveBrand,
  paypal: SiPaypal,
  resend: SiResend,
  salesforce: SalesforceBrand,
  servicenow: ServiceNowBrand,
  sharepoint: SharePointBrand,
  smartsheet: SmartsheetBrand,
  square: SiSquare,
  stripe: SiStripe,
  supabase: SiSupabase,
  tldraw: SiTldraw,
  vercel: SiVercel,
  zendesk: SiZendesk,
};

export function getConnectorColor(name: string): string {
  const colors = [
    "#4f46e5",
    "#0891b2",
    "#059669",
    "#d97706",
    "#dc2626",
    "#7c3aed",
    "#db2777",
    "#65a30d",
    "#ea580c",
    "#0284c7",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) & 0xffffffff;
  }
  return colors[Math.abs(hash) % colors.length];
}

export function getConnectorIconUrl(connectorKey: string): string | null {
  const domain = CONNECTOR_ICON_DOMAINS[connectorKey];
  if (!domain) return null;
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;
}

function getConnectorFallbackIcon(
  connectorKey: string,
  name: string,
): LucideIcon {
  const value = `${connectorKey} ${name}`.toLocaleLowerCase();

  if (/gmail|mail|resend|mailtrap|tomba/.test(value)) return Mail;
  if (/notion|draft|document|mermaid|excalidraw/.test(value)) return FileText;
  if (/sharepoint|workspace|monday|asana|smartsheet/.test(value)) return Users;
  if (/onedrive|dropbox|box|cloud|netlify|vercel|supabase/.test(value))
    return Cloud;
  if (/salesforce|hubspot|attio|pitchbook|chronograph/.test(value))
    return BriefcaseBusiness;
  if (/jira|linear|zendesk|servicenow|make/.test(value)) return Workflow;
  if (/calendar|calcom|fantastical/.test(value)) return CalendarDays;
  if (/grafana|amplitude|metabase|morningstar|factset|daloopa/.test(value)) {
    return ChartNoAxesCombined;
  }
  if (/database|airtable|egnyte/.test(value)) return Database;
  if (/discord|slack|message|support/.test(value)) return MessageSquare;
  if (/search|ahrefs|tavily|clinical/.test(value)) return Search;
  if (/okta|clerk|cloudflare|socket|security/.test(value)) return ShieldCheck;
  if (/task|check|square/.test(value)) return SquareCheckBig;
  if (/box/.test(value)) return BoxIcon;
  return PlugZap;
}

export function ConnectorBrandIcon({
  connectorKey,
  name,
  className,
}: {
  connectorKey: string;
  name: string;
  className?: string;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const BrandIcon = LOCAL_BRAND_ICONS[connectorKey];
  const iconUrl =
    BrandIcon || imageFailed ? null : getConnectorIconUrl(connectorKey);
  const connectorColor = getConnectorColor(name);
  const FallbackIcon = getConnectorFallbackIcon(connectorKey, name);
  const useBrandImage = Boolean(iconUrl && imageLoaded);
  const iconSize = Math.max(
    22,
    Math.round(
      (className?.includes("profile") || className?.includes("detail")
        ? 56
        : 38) * 0.6,
    ),
  );

  return (
    <div
      className={`${className ? `${className} ` : ""}cm-brand-icon${
        BrandIcon
          ? " cm-brand-icon--local"
          : useBrandImage
            ? " cm-brand-icon--image"
            : " cm-brand-icon--fallback"
      }`}
      style={{ "--connector-color": connectorColor } as CSSProperties}
    >
      {BrandIcon ? (
        <BrandIcon size={iconSize} color="default" aria-hidden="true" />
      ) : (
        <FallbackIcon size={iconSize} strokeWidth={1.9} aria-hidden="true" />
      )}
      {iconUrl && (
        <img
          src={iconUrl}
          className={imageLoaded ? "is-loaded" : undefined}
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onLoad={() => setImageLoaded(true)}
          onError={() => {
            setImageLoaded(false);
            setImageFailed(true);
          }}
        />
      )}
    </div>
  );
}
