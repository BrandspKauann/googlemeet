import {getDatabase} from '../db/neon.mjs';
import {createCloudHandler} from '../cloud/handler.mjs';
export default createCloudHandler(getDatabase,{configured:()=>!!process.env.DATABASE_URL});
