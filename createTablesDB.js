let connString = process.env.DATABASE_URL || 'postgres://txstbteobiwucu:4f3b9f560b347b9a39b035edace61fddeb5d8f93d6635779f69b215d746e43b9@ec2-54-247-137-184.eu-west-1.compute.amazonaws.com:5432/d6sct12bbs92ns';
import PG from 'pg';
const Pool = PG.Pool;

const pool = new Pool({
  connectionString : connString,
  ssl: {
    rejectUnauthorized: false
  }
});

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

    pool.query("CREATE TABLE IF NOT EXISTS dbo.Scenes (SceneID uuid NOT NULL, Processed integer NOT NULL, isActive int NOT NULL, DistributorID character(50) NOT NULL, VisitID character(50) NOT NULL, DocumentID character(50) NOT NULL, CustomerID character(50) NOT NULL, EmployeeID character(50) NOT NULL, Custom character(5000) NULL)", (err, res) => {
        if (err) throw err;
        console.log('Таблица сцен создана');
      });

    pool.query("CREATE TABLE IF NOT EXISTS dbo.ClientSessions (Session uuid NOT NULL, isActive integer, DistributorID character(50) NULL, VisitID character(50) NULL, DocumentID character(50) NULL, CustomerID character(50) NULL, EmployeeID character(50) NULL, Custom character(5000) NULL, CreateDate timestamp without time zone NOT NULL, UpdatedDate timestamp without time zone NOT NULL)", (err, res) => {
        if (err) throw err;
        console.log('Таблица сессий создана');
      });
}

export {createTables, dropTables};