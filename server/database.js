import { config } from './config/config.js';
import PG from 'pg';

let connString = process.env.DATABASE_URL || config.dbPostgresURI;

const Pool = PG.Pool;
const pool = new Pool({
  connectionString: connString,
  ssl: {
    rejectUnauthorized: false
  }
});

function newSession(sessionId) {
  return new Promise((resolve, reject) => {
    pool.query('INSERT INTO dbo.ClientSessions (SessionID, isActive, CreateDate, UpdatedDate) VALUES ($1, 1, now(), now() );', [sessionId], (err, res) => {
      if (err) return reject({ type: "newSession", data: err.toString() });
      return resolve(JSON.stringify(res.rows));
    });
  });
};

function updateSession(sessionId, jsonMessage) {
  return new Promise((resolve, reject) => {
    pool.query('UPDATE dbo.ClientSessions SET DistributorID =$2,  VisitID = $3, DocumentID = $4, CustomerID =$5, EmployeeID =$6, Custom =$7, UpdatedDate = now() WHERE SessionID = $1;', [sessionId, jsonMessage.data.distributorID, jsonMessage.data.visitID, jsonMessage.data.documentID, jsonMessage.data.customerID, jsonMessage.data.employeeID, jsonMessage.data.custom], (err, res) => {
      if (err) return reject({ type: "updateSession", data: err.toString() });
      return resolve(JSON.stringify(res.rows));
    });
  });
};

function deleteSession(sessionId) {
  return new Promise((resolve, reject) => {
    pool.query('UPDATE dbo.ClientSessions SET isActive = 0, UpdatedDate = to_timestamp($2 / 1000.0) WHERE SessionID = $1;', [sessionId, Date.now()], (err, res) => {
      if (err) return reject({ type: "deleteSession", data: err.toString() });
      return resolve(JSON.stringify(res.rows));
    });
  });
};

function newScene(sessionId, sceneId) {
  let url = config.domain + 'onlinereco/scene/' + sceneId;
  return new Promise((resolve, reject) => {
    pool.query("INSERT INTO dbo.Scenes (SceneID, Processed, PutUrl, GetUrl, isActive, DistributorID, VisitID, DocumentID, CustomerID, EmployeeID, Custom, CreateDate, UpdatedDate, ErrorCode, ErrorDescription) SELECT $2, 1, $3, $3, 1, DistributorID, VisitID, DocumentID, CustomerID, EmployeeID, Custom, now(), now(), NULL, NULL FROM dbo.ClientSessions WHERE SessionID = $1" +
      "ON CONFLICT (SceneID) " +
      "DO " +
      "UPDATE SET (SceneID, Processed, PutUrl, GetUrl, isActive, DistributorID, VisitID, DocumentID, CustomerID, EmployeeID, Custom, UpdatedDate, ErrorCode, ErrorDescription) = (SELECT $2, 1, $3, $3, 1, DistributorID, VisitID, DocumentID, CustomerID, EmployeeID, Custom, now(), NULL, NULL FROM dbo.ClientSessions WHERE SessionID = $1);", [sessionId, sceneId, url], (err, res) => {
        if (err) return reject({ type: "newScene", data: err.toString() });
        return resolve(JSON.stringify(res.rows));
      });
  });
};

function finishNewScene(sceneId, checksum) {
  return new Promise((resolve, reject) => {
    pool.query('UPDATE dbo.Scenes SET Processed = 2, Checksum = $2, UpdatedDate = now() WHERE SceneID = $1;', [sceneId, checksum], (err, res) => {
      if (err) return reject({ type: "finishNewScene", data: err.toString() });
      return resolve(JSON.stringify(res.rows));
    });
  });
};

function sceneRecognized(sceneId, checksum) {
  return new Promise((resolve, reject) => {
    pool.query('UPDATE dbo.Scenes SET Processed = 3, Checksum = $2, UpdatedDate = now() WHERE SceneID = $1;', [sceneId, checksum], (err, res) => {
      if (err) return reject({ type: "sceneRecognized", data: err.toString() });
      return resolve(JSON.stringify(res.rows));
    });
  });
};

function errorScene(sceneId, erroCode, errorDescription) {
  return new Promise((resolve, reject) => {
    pool.query('UPDATE dbo.Scenes SET Processed = -1, ErrorCode = $2, ErrorDescription = $3 WHERE SceneID = $1;', [sceneId, erroCode, errorDescription], (err, res) => {
      if (err) return reject({ type: "errorScene", data: err.toString() });
      return resolve(JSON.stringify(res.rows));
    });
  });
};

function deleteScene(sessionId, sceneId) {
  return new Promise((resolve, reject) => {
    pool.query('UPDATE dbo.Scenes SET isActive = 0, UpdatedDate = now() WHERE SceneID = $1;', [sceneId], (err, res) => {
      if (err) return reject({ type: "deleteScene", data: err.toString() });
      resolve(JSON.stringify(res.rows));
    });
  });
};

function sceneStatuses(sessionId) {
  return new Promise((resolve, reject) => {
    pool.query("SELECT s.SceneID, s.Processed, Checksum, PutUrl, GetUrl, ErrorCode, ErrorDescription FROM dbo.Scenes s INNER JOIN dbo.ClientSessions cs ON cs.VisitID=s.VisitID AND cs.DocumentID=s.DocumentID WHERE cs.SessionID = $1 AND s.isActive =1;", [sessionId], (err, res) => {
      if (err) return reject({ type: "sceneStatuses", data: err.toString() });
      let sceneStatuses = { "type": "sceneStatuses" };
      sceneStatuses.data = res.rows;
      let result = JSON.stringify(sceneStatuses).replace(/sceneid/g, 'sceneID');
      result = result.replace(/puturl/g, 'putUrl');
      result = result.replace(/geturl/g, 'getUrl');
      result = result.replace(/errorcode/g, 'errorCode');
      result = result.replace(/errordescription/g, 'errorDescription');
      return resolve(result);
    });
  });
};

function setRecognitionResults(distributorID, recognitionStatus, recognitionReport, recognitionPhoto) {
  return new Promise((resolve, reject) => {
    pool.query("INSERT INTO dbo.RecognitionResults (DistributorID, RecognitionStatus, RecognitionReport, RecognitionPhoto) SELECT $1, $2, $3, $4" +
      "ON CONFLICT (DistributorID) " +
      "DO " +
      "UPDATE SET (DistributorID, RecognitionStatus, RecognitionReport, RecognitionPhoto) = (SELECT $1, $2, $3, $4);", [distributorID, recognitionStatus, recognitionReport, recognitionPhoto], (err, res) => {
        if (err) return reject({ type: "setRecognitionResults", data: err.toString() });
        return resolve(JSON.stringify(res.rows));
      });
  });
};

function getRecognitionResults() {
  return new Promise((resolve, reject) => {
    pool.query('SELECT DistributorID, RecognitionStatus FROM dbo.RecognitionResults;', (err, res) => {
      if (err) return reject({ type: "getRecognitionResults", data: err.toString() });
      return resolve(res.rows);
    });
  });
};

function getResultRowDetails(distributorId) {
  return new Promise((resolve, reject) => {
    pool.query("SELECT RecognitionReport, encode(RecognitionPhoto,'base64') AS RecognitionPhoto FROM dbo.RecognitionResults WHERE DistributorID = $1;", [distributorId], (err, res) => {
      if (err) return reject({ type: "getResultReport", data: err.toString() });
      return resolve(res.rows[0]);
    });
  });
};

function deleteResultRow(distributorId) {
  return new Promise((resolve, reject) => {
    pool.query("DELETE FROM dbo.RecognitionResults WHERE DistributorID = $1;", [distributorId], (err, res) => {
      if (err) return reject({ type: "deleteResultRow", data: err.toString() });
      return resolve(res.rows);
    });
  });
};

function getResultReport(distributorId) {
  return new Promise((resolve, reject) => {
    pool.query("SELECT tbl.RecognitionReport " +
      "FROM (" +
      "SELECT RecognitionReport, 0 AS OrderBy FROM dbo.RecognitionResults WHERE DistributorID = $1 UNION " +
      "SELECT RecognitionReport, 1 AS OrderBy FROM dbo.RecognitionResults WHERE DistributorID = '-1'" +
      ") tbl ORDER BY tbl.OrderBy LIMIT 1;", [distributorId], (err, res) => {
        if (err) return reject({ type: "getResultReport", data: err.toString() });
        return resolve(res.rows[0].recognitionreport);
      });
  });
};

function getResultPhoto(distributorId) {
  return new Promise((resolve, reject) => {
    pool.query("SELECT tbl.RecognitionPhoto " +
      "FROM (" +
      "SELECT RecognitionPhoto, 0 AS OrderBy FROM dbo.RecognitionResults WHERE DistributorID = $1 UNION " +
      "SELECT RecognitionPhoto, 1 AS OrderBy FROM dbo.RecognitionResults WHERE DistributorID = '-1'" +
      ") tbl ORDER BY tbl.OrderBy LIMIT 1;", [distributorId], (err, res) => {
        if (err) return reject({ type: "getResultPhoto", data: err.toString() });
        return resolve(res.rows[0].recognitionphoto);
      });
  });
};

function dbAddLog(log) {
  return new Promise((resolve, reject) => {
    pool.query('INSERT INTO dbo.Logs (TheDate, Project, FromTo, Data) VALUES (now(), $1, $2, $3);', [log.project, log.fromto, log.data], (err, res) => {
      if (err) { return reject({ type: "dbAddLog", data: err.toString() }); }

      pool.query('SELECT Id, TheDate, Project, FromTo, Data FROM dbo.Logs ORDER BY id DESC LIMIT 1;', (err, res) => {
        if (err) return reject({ type: "getAllLogs", data: err.toString() });
        return resolve(JSON.stringify(res.rows));
      });
    });
  });
};

function getAllLogs() {
  return new Promise((resolve, reject) => {
    pool.query('SELECT id, TheDate, Project, FromTo, Data FROM dbo.Logs;', (err, res) => {
      if (err) return reject({ type: "getAllLogs", data: err.toString() });
      return resolve(JSON.stringify(res.rows));
    });
  });
};

function queryScript(sqlScript, data = []) {
  return new Promise((resolve, reject) => {
    pool.query(sqlScript, data, (err, res) => {
      if (err) return reject({ type: "queryScript", data: err.toString() })
      return resolve(sqlScript, JSON.stringify(res.rows));
    });
  });
};



function getErrors() {
  return new Promise((resolve, reject) => {
    pool.query('SELECT ID, DistributorID, RecognitionType, ActionType, ErrorCode, ErrorDescription, HTTPStatusCode, WSClose FROM dbo.GenerateErrors ORDER BY id DESC;', (err, res) => {
      if (err) return reject({ type: "getErrors", data: err.toString() });
      return resolve(res.rows);
    });
  });
};

function setError(distributorId, recognitionType, actionType, errorCode, errorDescription, httpStatusCode, wsClose) {
  return new Promise((resolve, reject) => {
    pool.query('INSERT INTO dbo.GenerateErrors (DistributorID, RecognitionType, ActionType, ErrorCode, ErrorDescription, HTTPStatusCode, WSClose) SELECT $1, $2, $3, $4, $5, $6, $7;', [distributorId, recognitionType, actionType, errorCode, errorDescription, httpStatusCode, wsClose], (err, res) => {
      if (err) {
      console.log(err);
        return reject({ type: "setError", data: err.toString() });
    }
      return resolve(res.rows);
    });
  });
};

function deleteErrorRow(id) {
  return new Promise((resolve, reject) => {
    pool.query('DELETE FROM dbo.GenerateErrors WHERE ID = $1;', [id], (err, res) => {
      if (err) return reject({ type: "deleteErrorRow", data: err.toString() });
      return resolve(res.rows);
    });
  });
};

function getDistrIdBySceneId(sceneid) {
  return new Promise((resolve, reject) => {
    pool.query("SELECT DistributorID FROM dbo.Scenes WHERE SceneID = $1 LIMIT 1;", [sceneid], (err, res) => {
      if (err) return reject({ type: "getDistrIdBySceneId", data: err.toString() });
      return resolve(res.rows[0]);
    });
  });
};

function checkErrorBySessionID(recognitionType, actionType, sessionId) {
  return new Promise((resolve, reject) => {
    pool.query("SELECT tbl.ID, tbl.DistributorID, tbl.RecognitionType, tbl.ActionType, tbl.ErrorCode, tbl.ErrorDescription, tbl.HTTPStatusCode, tbl.WSClose " +
      "FROM (" +
      "SELECT ID, DistributorID, RecognitionType, ActionType, ErrorCode, ErrorDescription, HTTPStatusCode, WSClose, 0 AS OrderBy FROM dbo.GenerateErrors WHERE DistributorID != '-1' AND RecognitionType = $1 AND ActionType = $2 UNION " +
      "SELECT ID, DistributorID, RecognitionType, ActionType, ErrorCode, ErrorDescription, HTTPStatusCode, WSClose, 1 AS OrderBy FROM dbo.GenerateErrors WHERE DistributorID = '-1' AND RecognitionType = $1 AND ActionType = $2 " +
      ") tbl " +
      "LEFT JOIN dbo.ClientSessions cs ON tbl.DistributorID = cs.DistributorID OR tbl.DistributorID = '-1' " +
      "WHERE cs.SessionID = $3 " +
      "ORDER BY tbl.ID DESC, tbl.OrderBy LIMIT 1;", [recognitionType, actionType, sessionId], (err, res) => {
        if (err) return reject({ type: "checkError", data: err.toString() });
        return resolve(res.rows[0]);
      });
  });
};

function checkErrorByDistributorID(recognitionType, actionType, distributorId) {
  return new Promise((resolve, reject) => {
    pool.query("SELECT tbl.ID, tbl.DistributorID, tbl.RecognitionType, tbl.ActionType, tbl.ErrorCode, tbl.ErrorDescription, tbl.HTTPStatusCode, tbl.WSClose " +
      "FROM (" +
      "SELECT ID, DistributorID, RecognitionType, ActionType, ErrorCode, ErrorDescription, HTTPStatusCode, WSClose, 0 AS OrderBy FROM dbo.GenerateErrors WHERE DistributorID != '-1' AND RecognitionType = $1 AND ActionType = $2 UNION " +
      "SELECT ID, DistributorID, RecognitionType, ActionType, ErrorCode, ErrorDescription, HTTPStatusCode, WSClose, 1 AS OrderBy FROM dbo.GenerateErrors WHERE DistributorID = '-1' AND RecognitionType = $1 AND ActionType = $2 " +
      ") tbl " +
      "WHERE tbl.DistributorID = $3 OR tbl.DistributorID = '-1' " +
      "ORDER BY tbl.ID DESC, tbl.OrderBy LIMIT 1;", [recognitionType, actionType, distributorId], (err, res) => {
        if (err) return reject({ type: "checkError", data: err.toString() });
        return resolve(res.rows[0]);
      });
  });
};

export { newSession, updateSession, deleteSession, newScene, finishNewScene, sceneRecognized, errorScene, deleteScene, sceneStatuses, setRecognitionResults, getRecognitionResults, getResultRowDetails, deleteResultRow, getResultReport, getResultPhoto, queryScript, dbAddLog, getAllLogs, getErrors, setError, deleteErrorRow, checkErrorBySessionID, checkErrorByDistributorID, getDistrIdBySceneId };