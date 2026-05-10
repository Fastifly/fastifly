repo_root = str(local('pwd', quiet=True)).strip()

database_driver = os.getenv('FASTIFLY_DEV_DB', 'sqlite')
seed_level = os.getenv('FASTIFLY_DEV_SEED', 'e2e')
postgres_port = os.getenv('FASTIFLY_DEV_POSTGRES_PORT', '55432')
api_port = os.getenv('APP_PORT', '3400')
web_port = os.getenv('FASTIFLY_WEB_PORT', '5173')
host = os.getenv('HOST', '127.0.0.1')

if database_driver != 'sqlite' and database_driver != 'postgres':
    fail('FASTIFLY_DEV_DB must be sqlite or postgres.')

if seed_level != 'none' and seed_level != 'essential' and seed_level != 'demo' and seed_level != 'e2e':
    fail('FASTIFLY_DEV_SEED must be none, essential, demo, or e2e.')

api_url = 'http://localhost:%s' % api_port
web_url = 'http://localhost:%s' % web_port
docs_url = '%s/api/docs' % api_url

if database_driver == 'sqlite':
    database_url = '%s/data/fastifly.dev.db' % repo_root
else:
    database_url = 'postgres://fastifly:fastifly@localhost:%s/fastifly?sslmode=disable' % postgres_port

runtime_env = {
    'APP_ENV': 'development',
    'NODE_ENV': 'development',
    'APP_PORT': api_port,
    'APP_URL': api_url,
    'HOST': host,
    'LOG_LEVEL': 'debug',
    'COOKIE_SECURE': 'false',
    'AUTO_MIGRATE': 'false',
    'SESSION_SECRET': 'development-only-session-secret-change-before-prod',
    'FASTIFLY_API_PROXY_TARGET': api_url,
    'VITE_FASTIFLY_API_BASE_URL': '',
    'DATABASE_DRIVER': database_driver,
    'DATABASE_URL': database_url,
    'FASTIFLY_DEV_POSTGRES_PORT': postgres_port,
}

runtime_package_deps = [
    'package.json',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    'packages/common/package.json',
    'packages/common/src',
    'packages/config/package.json',
    'packages/config/src',
    'packages/authz/package.json',
    'packages/authz/src',
    'packages/db/package.json',
    'packages/db/src',
    'apps/api/package.json',
]

local_resource(
    'runtime-packages',
    cmd='pnpm --filter @fastifly/common build && pnpm --filter @fastifly/config build && pnpm --filter @fastifly/authz build && pnpm --filter @fastifly/db build',
    deps=runtime_package_deps,
    env=runtime_env,
    labels=['setup'],
)

database_deps = ['runtime-packages']

if database_driver == 'sqlite':
    local_resource(
        'sqlite-data-dir',
        cmd='mkdir -p data',
        labels=['database'],
    )
    database_deps.append('sqlite-data-dir')
else:
    docker_compose('docker-compose.dev-postgres.yml')
    dc_resource(
        'postgres',
        labels=['database'],
        links=['postgres://localhost:%s/fastifly' % postgres_port],
    )
    local_resource(
        'postgres-ready',
        cmd='for i in $(seq 1 30); do docker compose -f docker-compose.dev-postgres.yml exec -T postgres pg_isready -U fastifly -d fastifly && exit 0; sleep 1; done; exit 1',
        resource_deps=['postgres'],
        labels=['database'],
    )
    database_deps.append('postgres-ready')

migrate_script = 'db:migrate:sqlite' if database_driver == 'sqlite' else 'db:migrate:postgres'

local_resource(
    'db-migrate',
    cmd='pnpm %s' % migrate_script,
    resource_deps=database_deps,
    env=runtime_env,
    labels=['database'],
)

seed_cmd = 'echo "Database migrated; seed disabled."'
if seed_level != 'none':
    seed_cmd = 'pnpm --filter @fastifly/db db:seed:%s' % seed_level
manual_seed_level = 'e2e' if seed_level == 'none' else seed_level
manual_seed_cmd = 'pnpm --filter @fastifly/db db:seed:%s' % manual_seed_level

local_resource(
    'db-ready',
    cmd=seed_cmd,
    resource_deps=['db-migrate'],
    env=runtime_env,
    labels=['database'],
)

local_resource(
    'db-clean',
    cmd='pnpm --filter @fastifly/db db:clean',
    resource_deps=['db-migrate'],
    env=runtime_env,
    labels=['database'],
    auto_init=False,
    trigger_mode=TRIGGER_MODE_MANUAL,
)

local_resource(
    'db-seed',
    cmd=manual_seed_cmd,
    resource_deps=['db-migrate'],
    env=runtime_env,
    labels=['database'],
    auto_init=False,
    trigger_mode=TRIGGER_MODE_MANUAL,
)

local_resource(
    'api',
    serve_cmd='pnpm --filter @fastifly/api exec tsx watch src/server.ts',
    resource_deps=['db-ready'],
    serve_env=runtime_env,
    readiness_probe=probe(
        period_secs=5,
        http_get=http_get_action(port=int(api_port), path='/health'),
    ),
    links=[api_url, docs_url],
    labels=['app'],
)

local_resource(
    'web',
    serve_cmd='pnpm --filter @fastifly/web exec vite --host %s --port %s --strictPort' % (host, web_port),
    resource_deps=['api'],
    serve_env=runtime_env,
    links=[web_url],
    labels=['app'],
)
