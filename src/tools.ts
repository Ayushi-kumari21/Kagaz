import { lazy, type ComponentType, type LazyExoticComponent } from 'react'
import type { IconName } from './components/icons'

export interface Tool {
  path: string
  title: string
  short: string
  desc: string
  icon: IconName
  /** extra words people might search for */
  keywords: string
  group: 'Edit' | 'Organize' | 'Convert' | 'Compress'
  nav?: boolean
  component: LazyExoticComponent<ComponentType>
}

export const TOOLS: Tool[] = [
  {
    path: '/edit-pdf',
    title: 'Edit PDF',
    short: 'Edit',
    desc: 'Add text, signatures, highlights, white-out, drawings and images. Download free.',
    icon: 'edit',
    keywords: 'text write add annotate white-out highlight',
    group: 'Edit',
    nav: true,
    component: lazy(() => import('./pages/Editor')),
  },
  {
    path: '/fill-pdf-form',
    title: 'Fill PDF form',
    short: 'Fill form',
    desc: 'Type into application forms, tick boxes and sign. Works with fillable and plain forms.',
    icon: 'form',
    keywords: 'fill application form type checkbox',
    group: 'Edit',
    nav: true,
    component: lazy(() => import('./pages/Editor')),
  },
  {
    path: '/sign-pdf',
    title: 'Sign PDF',
    short: 'Sign',
    desc: 'Draw, type or upload your signature and place it on any page.',
    icon: 'sign',
    keywords: 'signature autograph e-sign',
    group: 'Edit',
    component: lazy(() => import('./pages/Editor')),
  },
  {
    path: '/merge-pdf',
    title: 'Merge PDF',
    short: 'Merge',
    desc: 'Combine several PDFs into one file, in the order you choose.',
    icon: 'merge',
    keywords: 'combine join',
    group: 'Organize',
    nav: true,
    component: lazy(() => import('./pages/Merge')),
  },
  {
    path: '/split-pdf',
    title: 'Split PDF',
    short: 'Split',
    desc: 'Pull out selected pages, or split every page into its own file.',
    icon: 'split',
    keywords: 'extract pages separate',
    group: 'Organize',
    nav: true,
    component: lazy(() => import('./pages/Split')),
  },
  {
    path: '/organize-pdf',
    title: 'Rotate, reorder & delete pages',
    short: 'Organize',
    desc: 'Rotate, rearrange or remove pages with a visual page grid.',
    icon: 'organize',
    keywords: 'rotate reorder delete pages arrange',
    group: 'Organize',
    nav: true,
    component: lazy(() => import('./pages/Organize')),
  },
  {
    path: '/image-to-pdf',
    title: 'Images to PDF',
    short: 'JPG→PDF',
    desc: 'Turn phone photos of documents into a single PDF.',
    icon: 'imagePdf',
    keywords: 'jpg png photo scan convert',
    group: 'Convert',
    nav: true,
    component: lazy(() => import('./pages/ImagesToPdf')),
  },
  {
    path: '/pdf-to-image',
    title: 'PDF to images',
    short: 'PDF→JPG',
    desc: 'Save every page as a JPG or PNG image.',
    icon: 'pdfImage',
    keywords: 'jpg png convert export',
    group: 'Convert',
    component: lazy(() => import('./pages/PdfToImages')),
  },
  {
    path: '/compress-image',
    title: 'Compress photo to exact KB',
    short: 'Photo KB',
    desc: 'Shrink photos and signatures to an exact size for job, visa, exam and government forms.',
    icon: 'photo',
    keywords: 'kb resize reduce photo size passport visa exam signature',
    group: 'Compress',
    nav: true,
    component: lazy(() => import('./pages/CompressImage')),
  },
  {
    path: '/compress-pdf',
    title: 'Compress PDF',
    short: 'Shrink PDF',
    desc: 'Make PDFs small enough for upload limits like 1 MB or 2 MB.',
    icon: 'shrink',
    keywords: 'reduce size mb small',
    group: 'Compress',
    nav: true,
    component: lazy(() => import('./pages/CompressPdf')),
  },
]
