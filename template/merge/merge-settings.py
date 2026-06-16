import json, os, sys

def merge_config(settings_path, template_path):
    try:
        home = os.environ.get('HOME', '')
        try:
            with open(settings_path, 'r') as f:
                settings = json.load(f)
        except FileNotFoundError:
            return False, "File not found: " + settings_path
        except json.JSONDecodeError as e:
            return False, "Invalid JSON in " + settings_path + ": " + str(e)

        try:
            with open(template_path, 'r') as f:
                raw = f.read().replace('__HOME__', home)
            template = json.loads(raw)
        except FileNotFoundError:
            return False, "Template not found: " + template_path
        except json.JSONDecodeError as e:
            return False, "Invalid JSON in template after __HOME__ replacement: " + str(e)

        changed = False
        template_hooks = template.get('hooks', {})
        if template_hooks:
            existing_hooks = settings.get('hooks')
            if not isinstance(existing_hooks, dict):
                existing_hooks = {}
                changed = True
            merged_hooks = dict(existing_hooks)
            for event, hooks_list in template_hooks.items():
                if event not in existing_hooks:
                    merged_hooks[event] = hooks_list
                    changed = True
            if changed:
                settings['hooks'] = merged_hooks

        template_auto = template.get('autoMemoryEnabled', True)
        if settings.get('autoMemoryEnabled') != template_auto:
            settings['autoMemoryEnabled'] = template_auto
            changed = True

        template_env = template.get('env', {})
        current_env = settings.get('env', {})
        if not isinstance(current_env, dict):
            current_env = {}
            changed = True
        merged_env = dict(current_env)
        for k, v in template_env.items():
            if current_env.get(k) != v:
                merged_env[k] = v
                changed = True
        settings['env'] = merged_env

        if not changed:
            try:
                if os.path.exists(settings_path + '.bak.merge'):
                    os.remove(settings_path + '.bak.merge')
            except OSError:
                pass
            return False, None

        tmp_path = settings_path + '.merge.tmp'
        with open(tmp_path, 'w') as f:
            json.dump(settings, f, indent=2)
            f.write('\n')
        with open(tmp_path, 'r') as f:
            json.load(f)

        backup_path = settings_path + '.bak.evokit'
        try:
            if os.path.exists(backup_path):
                os.remove(backup_path)
            os.rename(settings_path, backup_path)
        except OSError as e:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
            return False, "Cannot backup " + settings_path + ": " + str(e)

        try:
            os.rename(tmp_path, settings_path)
        except OSError as e:
            if os.path.exists(backup_path):
                os.rename(backup_path, settings_path)
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
            return False, "Cannot write " + settings_path + ": " + str(e)

        try:
            if os.path.exists(settings_path + '.bak.merge'):
                os.remove(settings_path + '.bak.merge')
        except OSError:
            pass

        return True, None
    except Exception as e:
        return False, "Unexpected error: " + str(e)

if __name__ == '__main__':
    changed, err = merge_config(sys.argv[1], sys.argv[2])
    if err:
        print('ERROR', flush=True)
        sys.stderr.write('MERGE_ERROR: ' + err + '\n')
        sys.exit(1)
    elif changed:
        print('MERGED', flush=True)
        sys.exit(0)
    else:
        print('SKIPPED', flush=True)
        sys.exit(0)
