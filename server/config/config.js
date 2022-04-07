let config = {};

//GLOBAL
config.domain = 'https://ws-bb-sr.herokuapp.com/';
// (// (Vercel Supabase)) config.dbPostgresURI = 'postgresql://postgres:188123ZxcvbZ@db.uzljczoqzroarxbqyrjy.supabase.co:5432/postgres';
config.dbPostgresURI = 'postgres://txstbteobiwucu:4f3b9f560b347b9a39b035edace61fddeb5d8f93d6635779f69b215d746e43b9@ec2-54-247-137-184.eu-west-1.compute.amazonaws.com:5432/d6sct12bbs92ns';
config.db_name = 'd6sct12bbs92ns';

config.offline_api_token = '8CEB1B0C-1FEB-48EA-8F96-BB4DDBBB06D9';

//PATH
config.public_path = process.cwd() + '/public/';
config.server_path = process.cwd() + '/server/';

config.default_scene_result_path = process.cwd() + '/server/scenes/default_scene_result/';
config.new_scene = process.cwd() + '/server/scenes/new_scene/';
config.scene_results = process.cwd() + '/server/scenes/scene_results/';

export {config};
