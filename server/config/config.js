let config = {};

//GLOBAL
config.domain = 'https://ws-bb-sr-demo.herokuapp.com/';
config.dbPostgresURI = process.env.DATABASE_URL;
config.offline_api_token = process.env.OFFLINE_API_TOKEN;

//PATH
config.public_path = process.cwd() + '/public/';
config.server_path = process.cwd() + '/server/';

config.default_scene_result_path = process.cwd() + '/server/scenes/default_scene_result/';
config.new_scene = process.cwd() + '/server/scenes/new_scene/';
config.scene_results = process.cwd() + '/server/scenes/scene_results/';

export {config};
