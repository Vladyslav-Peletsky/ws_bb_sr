//import * as site from './site.js';
import {createTables,dropTables} from './createTablesDB.js';
import {onConnect} from './ws.js';

dropTables();
setTimeout(createTables, 1000); 