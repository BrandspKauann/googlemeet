import {neon} from '@neondatabase/serverless';
let database;
export function getDatabase(){
 if(!process.env.DATABASE_URL)throw Object.assign(new Error('Conecte o PostgreSQL e execute a migração antes de usar a versão em nuvem.'),{code:503});
 if(!database){const sql=neon(process.env.DATABASE_URL);database={async query(text,params=[]){return {rows:await sql.query(text,params)}}};}
 return database;
}
