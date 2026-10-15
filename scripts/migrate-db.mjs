import fs from 'node:fs';
import {neon} from '@neondatabase/serverless';
if(!process.env.DATABASE_URL)throw Error('Configure DATABASE_URL em .env.local. Não envie a chave pelo chat.');
const sql=neon(process.env.DATABASE_URL);
const statements=fs.readFileSync(new URL('../db/schema.sql',import.meta.url),'utf8').split(';').map(s=>s.trim()).filter(Boolean);
await sql.transaction(statements.map(s=>sql.query(s,[])));
console.log('Estrutura PostgreSQL criada. Nenhuma transcrição antiga foi copiada.');
