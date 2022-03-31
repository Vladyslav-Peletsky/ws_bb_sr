import {config} from './config/config.js';
import PG from 'pg';

let connString = process.env.DATABASE_URL || config.dbPostgresURI;

const Pool = PG.Pool;
const pool = new Pool({
  connectionString : connString,
  ssl: {
    rejectUnauthorized: false
  }
});

function newSession(sessionId) {
  return	new Promise((resolve, reject) => {
    pool.query('INSERT INTO dbo.ClientSessions (SessionID, isActive, CreateDate, UpdatedDate) VALUES ($1,1,to_timestamp($2 / 1000.0),to_timestamp($2 / 1000.0));',[sessionId,Date.now()], (err, res) => {
        if (err) return reject( {type:"newSession", data:err.toString()} );
        return resolve(JSON.stringify(res.rows));
      });
    });
};

function updateSession(sessionId, jsonMessage) {
  return	new Promise((resolve, reject) => {
    pool.query('UPDATE dbo.ClientSessions SET DistributorID =$3,  VisitID = $4, DocumentID = $5, CustomerID =$6, EmployeeID =$7, Custom =$8, UpdatedDate = to_timestamp($2 / 1000.0) WHERE SessionID = $1;',[sessionId, Date.now(), jsonMessage.data.distributorID, jsonMessage.data.visitID, jsonMessage.data.documentID, jsonMessage.data.customerID, jsonMessage.data.employeeID, jsonMessage.data.custom], (err, res) => {
        if (err) return reject( {type:"updateSession", data:err.toString()} );
        return resolve(JSON.stringify(res.rows));
    });
  });
};

function deleteSession(sessionId) {
  return	new Promise((resolve, reject) => {
    pool.query('UPDATE dbo.ClientSessions SET isActive = 0, UpdatedDate = to_timestamp($2 / 1000.0) WHERE SessionID = $1;',[sessionId,Date.now()], (err, res) => {
        if (err) return reject( {type:"deleteSession", data:err.toString()} );
        return resolve(JSON.stringify(res.rows));
      });
    });
};

function newScene(sessionId, sceneId) {
  let url = config.domain + 'onlinereco/scene/' + sceneId;
  return	new Promise((resolve, reject) => {
      pool.query("INSERT INTO dbo.Scenes (SceneID, Processed, PutUrl, GetUrl, isActive, DistributorID, VisitID, DocumentID, CustomerID, EmployeeID, Custom) SELECT $2, 1, $3, $3, 1, DistributorID, VisitID, DocumentID, CustomerID, EmployeeID, Custom FROM dbo.ClientSessions WHERE SessionID = $1"+
                 "ON CONFLICT (SceneID) " +
                 "DO " +
                 "UPDATE SET (SceneID, Processed, PutUrl, GetUrl, isActive, DistributorID, VisitID, DocumentID, CustomerID, EmployeeID, Custom) = (SELECT $2, 1, $3, $3, 1, DistributorID, VisitID, DocumentID, CustomerID, EmployeeID, Custom FROM dbo.ClientSessions WHERE SessionID = $1);",[sessionId,sceneId,url], (err, res) => {
          if (err) return reject( {type:"newScene", data:err.toString()} );
          return resolve(JSON.stringify(res.rows));
      });
    });
};

function finishNewScene(sceneId, checksum) {
  return	new Promise((resolve, reject) => {  
      pool.query('UPDATE dbo.Scenes SET Processed = 2, Checksum = $2 WHERE SceneID = $1;',[sceneId,checksum], (err, res) => {
          if (err) return reject( {type:"finishNewScene", data:err.toString()} );
          return resolve(JSON.stringify(res.rows));
      });
    });
};

function sceneRecognized(sceneId, checksum) {
  return	new Promise((resolve, reject) => {  
      pool.query('UPDATE dbo.Scenes SET Processed = 3, Checksum = $2 WHERE SceneID = $1;',[sceneId, checksum], (err, res) => {
          if (err) return reject( {type:"sceneRecognized", data:err.toString()} );
          return resolve(JSON.stringify(res.rows));
      });
    });
};

function deleteScene(sessionId, sceneId) {
  return	new Promise((resolve, reject) => {  
      pool.query('UPDATE dbo.Scenes SET isActive = 0 WHERE SceneID = $1;',[sceneId], (err, res) => {
          if (err) return reject( {type:"deleteScene", data:err.toString()} );
          resolve(JSON.stringify(res.rows));
      });
    });
};

function sceneStatuses(sessionId) {
  return new Promise((resolve, reject) => {
      pool.query("SELECT s.SceneID, s.Processed, Checksum, PutUrl, GetUrl FROM dbo.Scenes s INNER JOIN dbo.ClientSessions cs ON cs.VisitID=s.VisitID AND cs.DocumentID=s.DocumentID WHERE cs.SessionID = $1 AND s.isActive =1;",[sessionId], (err, res) => {
          if (err) return reject( {type:"sceneStatuses", data:err.toString()} );
          let sceneStatuses = {"type":"sceneStatuses"};
          sceneStatuses.data = res.rows;
          let result = JSON.stringify(sceneStatuses).replace(/sceneid/g, 'sceneID');
            result = result.replace(/puturl/g, 'putUrl');
            result = result.replace(/geturl/g, 'getUrl');
          return resolve(result);
      });
  });
};

function setRecognitionResults(distributorID, recognitionStatus, recognitionReport, recognitionPhoto) {
  return	new Promise((resolve, reject) => {
      pool.query("INSERT INTO dbo.RecognitionResults (DistributorID, RecognitionStatus, RecognitionReport, RecognitionPhoto) SELECT $1, $2, $3, $4"+
                 "ON CONFLICT (DistributorID) " +
                 "DO " +
                 "UPDATE SET (DistributorID, RecognitionStatus, RecognitionReport, RecognitionPhoto) = (SELECT $1, $2, $3, $4);",[distributorID, recognitionStatus, recognitionReport, recognitionPhoto], (err, res) => {
          if (err) return reject( {type:"setRecognitionResults", data:err.toString()} );
          return resolve(JSON.stringify(res.rows));
      });
    });
};

function getRecognitionResults() {
  return	new Promise((resolve, reject) => {  
      pool.query('SELECT DistributorID, RecognitionStatus FROM dbo.RecognitionResults;', (err, res) => {
          if (err) return reject( {type:"getRecognitionResults", data:err.toString()} );
          return resolve(res.rows);
      });
    });
};

function getResultRowDetails(distributorId) {
  return	new Promise((resolve, reject) => {  
      pool.query("SELECT RecognitionReport, encode(RecognitionPhoto,'base64') AS RecognitionPhoto FROM dbo.RecognitionResults WHERE DistributorID = $1;", [distributorId], (err, res) => {
          if (err) return reject( {type:"getResultReport", data:err.toString()} );
          return resolve(res.rows[0]);
      });
    });
};

function deleteResultRow(distributorId) {
  return	new Promise((resolve, reject) => {  
      pool.query("DELETE FROM dbo.RecognitionResults WHERE DistributorID = $1;", [distributorId], (err, res) => {
          if (err) return reject( {type:"deleteResultRow", data:err.toString()} );
          return resolve(res.rows);
      });
    });
};

function getResultReport(distributorId) {
  return	new Promise((resolve, reject) => {  
      pool.query("SELECT tbl.RecognitionReport "+
                 "FROM ("+
                 "SELECT RecognitionReport, 0 AS OrderBy FROM dbo.RecognitionResults WHERE DistributorID = $1 UNION "+
                 "SELECT RecognitionReport, 1 AS OrderBy FROM dbo.RecognitionResults WHERE DistributorID = '-1'"+
                 ") tbl ORDER BY tbl.OrderBy LIMIT 1;", [distributorId], (err, res) => {
          if (err) return reject( {type:"getResultReport", data:err.toString()} );
          return resolve(res.rows[0].recognitionreport);
      });
    });
};

function getResultPhoto(distributorId) {
  return	new Promise((resolve, reject) => {  
      pool.query("SELECT tbl.RecognitionPhoto "+
                 "FROM ("+
                 "SELECT RecognitionPhoto, 0 AS OrderBy FROM dbo.RecognitionResults WHERE DistributorID = $1 UNION "+
                 "SELECT RecognitionPhoto, 1 AS OrderBy FROM dbo.RecognitionResults WHERE DistributorID = '-1'"+
                 ") tbl ORDER BY tbl.OrderBy LIMIT 1;", [distributorId], (err, res) => {
          if (err) return reject( {type:"getResultPhoto", data:err.toString()} );
          return resolve(res.rows[0].recognitionphoto);
      });
    });
};

function dbAddLog(log) {
  return	new Promise((resolve, reject) => {  
      pool.query('INSERT INTO dbo.Logs (TheDate, Status, MessageFrom, Action, Data) VALUES ($1, $2, $3, $4, $5);',[log.thedate, log.status, log.messagefrom, log.action, log.data], (err, res) => {
          if (err) return reject( {type:"dbAddLog", data:err.toString()} );
          return resolve(JSON.stringify(res.rows));
      });
    });
};

function getAllLogs(log) {
  return	new Promise((resolve, reject) => {  
      pool.query('SELECT TheDate, Status, MessageFrom, Action, Data FROM dbo.Logs;', (err, res) => {
          if (err) return reject( {type:"getAllLogs", data:err.toString()} );
          return resolve(JSON.stringify(res.rows));
      });
    });
};

function queryScript(sqlScript, data = []) {
  return	new Promise((resolve, reject) => {  
        pool.query(sqlScript, data, (err, res) => {
            if (err) return reject( {type:"queryScript", data:err.toString()} )
            return resolve(sqlScript, JSON.stringify(res.rows));
        });
    });
};


export {newSession, updateSession, deleteSession, newScene, finishNewScene, sceneRecognized, deleteScene, sceneStatuses, setRecognitionResults, getRecognitionResults, getResultRowDetails, deleteResultRow, getResultReport, getResultPhoto, queryScript, dbAddLog, getAllLogs};