import { VaultDocument } from '../types/workspace';

export const SEED_DOCUMENTS: Omit<VaultDocument, 'chunkCount'>[] = [
  {
    id: 'sample-pdf-resilience',
    name: 'Q3 Infrastructure Resilience Audit.pdf',
    format: 'pdf',
    sizeBytes: 18420,
    uploadedAt: 1764040000000,
    pageCount: 3,
    wordCount: 318,
    selected: true,
    isSample: true,
    pages: [
      {
        pageNumber: 1,
        label: 'Page 1',
        text: 'Executive Summary: Q3 Edge Cluster Resilience Audit. During Q3 2026, regional edge nodes achieved 99.94% uptime across 42 distributed field stations, exceeding the 99.90% service target. Mean time to recovery (MTTR) improved from 18 minutes to 6.4 minutes following local cache failover automation. Total operating expenditure for edge compute remained 14% below forecast at $128,400.',
      },
      {
        pageNumber: 2,
        label: 'Page 2',
        text: 'Storage & Offline Continuity Findings: Local NVMe ring buffers retained 72 hours of telemetry during simulated WAN blackouts with zero packet loss. However, three legacy stations (Node-07, Node-19, Node-31) reported thermal throttling above 78C when running concurrent media encoding workloads. Firmware patch v4.2 reduces peak TDP by 19% and is scheduled for rollout on October 12, 2026.',
      },
      {
        pageNumber: 3,
        label: 'Page 3',
        text: 'Security & Compliance Risks: All local inference payloads stayed inside encrypted IndexedDB and hardware enclave boundaries with zero external egress detected across 1.2 million audit events. Risk Item R-04 identifies unencrypted USB diagnostic ports on older enclosures as a medium-severity physical risk requiring tamper seals by Q4.',
      },
    ],
  },
  {
    id: 'sample-docx-privacy',
    name: 'Edge Privacy Architecture Spec.docx',
    format: 'docx',
    sizeBytes: 14110,
    uploadedAt: 1764043600000,
    pageCount: 2,
    wordCount: 235,
    selected: true,
    isSample: true,
    pages: [
      {
        pageNumber: 1,
        label: 'Section 1',
        text: 'Local-First Document Pipeline Architecture. Documents ingested in PDF, DOCX, and TXT formats must be parsed exclusively inside browser Web Workers or isolated client memory. No raw document bytes, extracted chunks, or user queries may leave the client device. Indexing relies on deterministic BM25 lexical scoring combined with character n-gram vectors stored in local IndexedDB.',
      },
      {
        pageNumber: 2,
        label: 'Section 2',
        text: 'Rich Media Isolation Controls. Audio briefings, visual diagrams, and summary video exports are synthesized on-device using Web Audio PCM buffers and HTML5 Canvas 2D compositors. Users may export PNG diagrams, WAV audio briefings, and WebM video recaps while preserving strict air-gap isolation. Memory buffers are zeroed upon vault purge.',
      },
    ],
  },
  {
    id: 'sample-txt-incidents',
    name: 'Field Ops Incident Log.txt',
    format: 'txt',
    sizeBytes: 4280,
    uploadedAt: 1764047200000,
    pageCount: 1,
    wordCount: 158,
    selected: true,
    isSample: true,
    pages: [
      {
        pageNumber: 1,
        label: 'Lines 1-24',
        text: '2026-09-14 08:12 UTC | Station-19 | Thermal warning 79C during batch PDF ingestion; fan curve adjusted to 85% duty cycle.\n2026-09-19 14:40 UTC | Station-04 | WAN link severed for 11 hours during storm; offline Q&A and WAV briefing generation continued uninterrupted with 0 failed queries.\n2026-09-27 19:05 UTC | Station-31 | Battery reserve dropped to 22% during video rendering; low-power 15fps fallback activated automatically and completed export in 9.2 seconds.',
      },
    ],
  },
];
