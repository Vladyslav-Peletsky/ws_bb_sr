let connString = process.env.DATABASE_URL || 'postgres://txstbteobiwucu:4f3b9f560b347b9a39b035edace61fddeb5d8f93d6635779f69b215d746e43b9@ec2-54-247-137-184.eu-west-1.compute.amazonaws.com:5432/d6sct12bbs92ns';
import PG from 'pg';
const Pool = PG.Pool;

const pool = new Pool({
  connectionString : connString,
  ssl: {
    rejectUnauthorized: false
  }
});


function newSession(uuid) {
  return	new Promise((resolve, reject) => {
    pool.query('INSERT INTO dbo.ClientSessions (Session, isActive, CreateDate, UpdatedDate) VALUES ($1,1,to_timestamp($2 / 1000.0),to_timestamp($2 / 1000.0));',[uuid,Date.now()], (err, res) => {
        if (err) throw err;
        resolve(JSON.stringify(res.rows));
      });
    });
}

function updateSession(uuid, jsonMessage) {
  return	new Promise((resolve, reject) => {
     pool.query('UPDATE dbo.ClientSessions SET DistributorID =$3,  VisitID = $4, DocumentID = $5, CustomerID =$6, EmployeeID =$7, Custom =$8, UpdatedDate = to_timestamp($2 / 1000.0) WHERE Session = $1;',[uuid, Date.now(), jsonMessage.data.distributorID, jsonMessage.data.visitID, jsonMessage.data.documentID, jsonMessage.data.customerID, jsonMessage.data.employeeID, jsonMessage.data.custom], (err, res) => {
        if (err) throw err;
        console.log(res.rows);
        resolve(JSON.stringify(res.rows));
    });
  });
}

function deleteSession(uuid) {
  return	new Promise((resolve, reject) => {
    pool.query('UPDATE dbo.ClientSessions SET isActive = 0, UpdatedDate = to_timestamp($2 / 1000.0) WHERE Session = $1;',[uuid,Date.now()], (err, res) => {
        if (err) throw err;
        resolve(JSON.stringify(res.rows));
      });
    });
}

function newScene(uuid, sceneID) {
  return	new Promise((resolve, reject) => {
      pool.query('INSERT INTO dbo.Scenes (SceneID, Processed, PutUrl, GetUrl, isActive, DistributorID, VisitID, DocumentID, CustomerID, EmployeeID, Custom) SELECT $2, 1, 1, 1, 1, DistributorID, VisitID, DocumentID, CustomerID, EmployeeID, Custom FROM dbo.ClientSessions WHERE Session = $1 AND NOT EXISTS (SELECT 1 FROM dbo.Scenes WHERE SceneID = $2);',[uuid,sceneID], (err, res) => {
          if (err) throw err;
          console.log('newScene:' + sceneID);
          console.log(res.rows);
          resolve(JSON.stringify(res.rows));
      });
    });
}

function finishNewScene(sceneID, checksum) {
  return	new Promise((resolve, reject) => {  
      pool.query('UPDATE dbo.Scenes SET Processed = 2, Checksum = $2 WHERE SceneID = $1;',[sceneID,checksum], (err, res) => {
          if (err) throw err;
          console.log('finishNewScene:' + sceneID);
          console.log(res.rows);
          resolve(JSON.stringify(res.rows));
      });
    });
}

function sceneRecognized(sceneID, checksum) {
  return	new Promise((resolve, reject) => {  
      pool.query('UPDATE dbo.Scenes SET Processed = 3, Checksum = $2 WHERE SceneID = $1;',[sceneID, checksum], (err, res) => {
          if (err) throw err;
          console.log('sceneRecognized:' + sceneID);
          console.log(res.rows);
          resolve(JSON.stringify(res.rows));
      });
    });
}

function deleteScene(uuid, sceneID) {
  return	new Promise((resolve, reject) => {  
      pool.query('UPDATE dbo.Scenes SET isActive = 0 WHERE SceneID = $1;',[sceneID], (err, res) => {
          if (err) throw err;
          console.log('deleteScene:' + sceneID);
          console.log(res.rows);
          resolve(JSON.stringify(res.rows));
      });
    });
}

function sceneStatuses(uuid) {
  return new Promise(resolve => {
    pool.query("SELECT s.SceneID, s.Processed, Checksum, TRIM(PutUrl) AS PutUrl, TRIM(GetUrl) AS GetUrl FROM dbo.Scenes s INNER JOIN dbo.ClientSessions cs ON cs.VisitID=s.VisitID AND cs.DocumentID=s.DocumentID WHERE cs.Session = $1 AND s.isActive =1;",[uuid], (err, res) => {
        if (err) throw err;
        console.log('sceneStatuses _ uuid :' + uuid);
        let sceneStatuses = {"type":"sceneStatuses"};
        sceneStatuses.data = res.rows;
        let result = JSON.stringify(sceneStatuses).replace(/sceneid/g, 'sceneID');
          result = result.replace(/puturl/g, 'putUrl');
          result = result.replace(/geturl/g, 'getUrl');
        console.log(result);
        resolve(result);
    });
    
  });
}



function dropTables() {
  pool.query("DROP TABLE IF EXISTS dbo.Scenes", (err, res) => {
      if (err) throw err;
      console.log('Таблица сцен удалена');
    });
  pool.query("DROP TABLE IF EXISTS dbo.ClientSessions", (err, res) => {
      if (err) throw err;
      console.log('Таблица сессий удалена');
    });

}

function createTables() {
    pool.query("CREATE SCHEMA IF NOT EXISTS dbo", (err, res) => {
        if (err) throw err;
        console.log('Схема создана');
      });
    pool.query("CREATE TABLE IF NOT EXISTS dbo.Scenes (SceneID uuid NOT NULL, Processed integer NOT NULL, PutUrl character(200), GetUrl character(200), Checksum character(32) NULL, isActive int NOT NULL, DistributorID character(50) NOT NULL, VisitID character(50) NOT NULL, DocumentID character(50) NOT NULL, CustomerID character(50) NOT NULL, EmployeeID character(50) NOT NULL, Custom character(5000) NULL)", (err, res) => {
        if (err) throw err;
        console.log('Таблица сцен создана');
      });
    pool.query("CREATE TABLE IF NOT EXISTS dbo.ClientSessions (Session uuid NOT NULL, isActive integer, DistributorID character(50) NULL, VisitID character(50) NULL, DocumentID character(50) NULL, CustomerID character(50) NULL, EmployeeID character(50) NULL, Custom character(5000) NULL, CreateDate timestamp without time zone NOT NULL, UpdatedDate timestamp without time zone NOT NULL)", (err, res) => {
        if (err) throw err;
        console.log('Таблица сессий создана');
      });
}



export {dropTables, createTables, newSession, updateSession, deleteSession, newScene, finishNewScene, sceneRecognized, deleteScene, sceneStatuses};