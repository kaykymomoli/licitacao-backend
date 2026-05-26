import * as dotenv from 'dotenv';
dotenv.config();

import * as fs from 'fs';
import * as path from 'path';
import { OpenAIEmbeddings } from '@langchain/openai';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { createClient } from '@supabase/supabase-js';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const embeddings = new OpenAIEmbeddings({
  apiKey: process.env.OPENAI_API_KEY!,
  model: 'text-embedding-3-small',
});

const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 1000,
  chunkOverlap: 200,
});

// Mapeamento de arquivos para metadados
const documents = [
  {
    file: 'legislacao/INPDFViewer.pdf',
    source: 'Lei 14.133/2021',
    title: 'Lei de Licitações e Contratos Administrativos',
    agentType: 'ALL',
  },
  {
    file: 'legislacao/LeideLicitaeseContratos14133traduzidaemingles.pdf',
    source: 'Lei 14.133/2021',
    title: 'Lei de Licitações e Contratos Administrativos',
    agentType: 'ALL',
  },
  {
    file: 'templates/ETP - [CRED] para contratações paralelas e não exludentes.pdf',
    source: 'Modelo ETP',
    title: 'Modelo de Estudo Técnico Preliminar',
    agentType: 'ETP',
  },
  {
    file: 'templates/ETP - Climatizadores Ar Condiciandores.pdf',
    source: 'Modelo ETP',
    title: 'Modelo de Estudo Técnico Preliminar',
    agentType: 'ETP',
  },
  {
    file: 'templates/TR - [CRED] para contratações paralelas e não exludentes.pdf',
    source: 'Modelo TR',
    title: 'Modelo de Termo de Referência',
    agentType: 'TR',
  },
  {
    file: 'templates/TR - [PREGÃO] BENS COMUNS SRP.pdf',
    source: 'Modelo TR',
    title: 'Modelo de Edital de Licitação',
    agentType: 'TR',
  },
];


async function extractTextFromPdf(filePath: string): Promise<string> {
  const data = new Uint8Array(fs.readFileSync(filePath));
  const doc = await pdfjsLib.getDocument({ data }).promise;
  const pages: string[] = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item: any) => item.str)
      .join(' ');
    pages.push(pageText);
  }

  return pages.join('\n');
}

async function ingestDocument(doc: typeof documents[0]) {
  const filePath = path.join(__dirname, 'documents', doc.file);

  if (!fs.existsSync(filePath)) {
    console.log(`Arquivo não encontrado, pulando: ${doc.file}`);
    return;
  }

  console.log(`\nProcessando: ${doc.source}`);

  const text = await extractTextFromPdf(filePath);
  console.log(`  Texto extraído: ${text.length} caracteres`);

  const chunks = await splitter.splitText(text);
  console.log(`  Chunks gerados: ${chunks.length}`);

  let saved = 0;
  const batchSize = 10;

  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    const batchEmbeddings = await embeddings.embedDocuments(batch);

    const records = batch.map((content, idx) => ({
      agent_type: doc.agentType,
      source: doc.source,
      title: doc.title,
      content,
      embedding: batchEmbeddings[idx],
      metadata: {
        file: doc.file,
        chunk_index: i + idx,
        total_chunks: chunks.length,
      },
    }));

    const { error } = await supabase
      .from('knowledge_base')
      .insert(records);

    if (error) {
      console.error(`  Erro ao salvar lote ${i}: ${error.message}`);
    } else {
      saved += batch.length;
      console.log(`  Salvo: ${saved}/${chunks.length} chunks`);
    }

    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`  Concluído: ${doc.source}`);
}

async function main() {
  console.log('Iniciando ingestão de documentos...\n');

  const args = process.argv.slice(2);
  if (args.includes('--reset')) {
    console.log('Limpando base de conhecimento...');
    await supabase
      .from('knowledge_base')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');
    console.log('Base limpa.\n');
  }

  for (const doc of documents) {
    await ingestDocument(doc);
  }

  console.log('\nIngestão concluída!');
  process.exit(0);
}

main().catch(console.error);