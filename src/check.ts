import 'dotenv/config';
import process from 'node:process';
import postgres from 'postgres';

const databaseUrl=process.env.DATABASE_URL;

if(databaseUrl === undefined){
    throw new Error('DATABASE_URL is missing. add it to your .enve file.');

}

const sql = postgres(databaseUrl, {max: 1});

try{
    const rows=await sql<{ database: string; serverTime: Date}[]>`
    
        SELECT
            current_database() AS database,
            now() AS "serverTime"
            `;

            const result = rows[0];

            if(result === undefined){
                throw new Error('PostgreSQL returned no connection-check result.');
            }

            console.log(`connected to database: ${result.database}`);
            console.log(`Database time: ${result.serverTime.toISOString()}`);

} finally{
    await sql.end();
}