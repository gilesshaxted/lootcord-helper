document.addEventListener('DOMContentLoaded', () => {
    const authSection = document.getElementById('auth-section');
    const dashboardContent = document.getElementById('dashboard-content');
    const usernameSpan = document.getElementById('username');
    const logoutButton = document.getElementById('logout-button');
    const guildSelect = document.getElementById('guild-select');
    const configSection = document.getElementById('config-section');
    const selectedGuildName = document.getElementById('selected-guild-name');

    const channelSetForm = document.getElementById('channel-set-form');
    const availableChannelsList = document.getElementById('available-channels-list');

    const shopPingsForm = document.getElementById('shop-pings-form');
    const shopChannelSelect = document.getElementById('shop-channel-select');
    const resourcesRoleSelect = document.getElementById('resources-role-select');
    const lootRoleSelect = document.getElementById('loot-role-select');
    const weaponsRoleSelect = document.getElementById('weapons-role-select');
    const ammoRoleSelect = document.getElementById('ammo-role-select');
    const medsRoleSelect = document.getElementById('meds-role-select');

    // --- Utility Functions ---
    async function fetchData(url, method = 'GET', body = null) {
        const options = {
            method,
            headers: {
                'Content-Type': 'application/json',
            },
        };
        if (body) {
            options.body = JSON.stringify(body);
        }
        const response = await fetch(url, options);
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));
            throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
        }
        return response.json();
    }

    function showMessage(message, type = 'info') {
        // Implement a simple message display (e.g., a div at the top of the dashboard)
        // For now, we'll just log to console.
        console.log(`[${type.toUpperCase()}] ${message}`);
        // A more robust UI would update a dedicated message area
    }

    // --- Discord OAuth Handling ---
    async function checkLoginStatus() {
        try {
            const response = await fetch('/api/auth/status');
            if (response.ok) {
                const user = await response.json();
                if (user && user.id) {
                    usernameSpan.textContent = user.username;
                    authSection.classList.add('hidden');
                    dashboardContent.classList.remove('hidden');
                    await loadGuilds();
                    return;
                }
            }
        } catch (error) {
            console.error('Error checking login status:', error);
        }
        authSection.classList.remove('hidden');
        dashboardContent.classList.add('hidden');
    }

    logoutButton.addEventListener('click', async () => {
        try {
            await fetch('/api/auth/logout', { method: 'POST' });
            window.location.reload(); // Reload to show login screen
        } catch (error) {
            console.error('Error logging out:', error);
            showMessage('Failed to log out.', 'error');
        }
    });

    // --- Guild & Config Loading ---
    async function loadGuilds() {
        try {
            const guilds = await fetchData('/api/guilds');
            guildSelect.innerHTML = '<option value="">-- Select a Guild --</option>';
            guilds.forEach(guild => {
                const option = document.createElement('option');
                option.value = guild.id;
                option.textContent = guild.name;
                guildSelect.appendChild(option);
            });
            guildSelect.addEventListener('change', loadGuildConfig);
            showMessage('Guilds loaded successfully.', 'success');
        } catch (error) {
            console.error('Error loading guilds:', error);
            showMessage('Failed to load guilds. Please ensure the bot is in your desired servers.', 'error');
        }
    }

    async function loadGuildConfig() {
        const guildId = guildSelect.value;
        if (!guildId) {
            configSection.classList.add('hidden');
            return;
        }

        selectedGuildName.textContent = `Configuration for ${guildSelect.options[guildSelect.selectedIndex].text}`;
        configSection.classList.remove('hidden');

        // Load Channel Set Config
        await loadChannelSetConfig(guildId);
        // Load Shop Pings Config
        await loadShopPingsConfig(guildId);
        // Load all channels and roles for dropdowns
        await loadChannelsAndRolesForDropdowns(guildId);
    }

    async function loadChannelsAndRolesForDropdowns(guildId) {
        try {
            const { channels, roles } = await fetchData(`/api/guild/${guildId}/channels-and-roles`);
            
            // Populate Channel Select for Shop Pings
            shopChannelSelect.innerHTML = '<option value="">-- Select Shop Channel --</option>';
            channels.forEach(channel => {
                const option = document.createElement('option');
                option.value = channel.id;
                option.textContent = `#${channel.name}`;
                shopChannelSelect.appendChild(option);
            });

            // Populate Role Selects for Shop Pings
            const roleSelects = [resourcesRoleSelect, lootRoleSelect, weaponsRoleSelect, ammoRoleSelect, medsRoleSelect];
            roleSelects.forEach(select => {
                select.innerHTML = '<option value="">-- Select Role --</option>';
                roles.forEach(role => {
                    const option = document.createElement('option');
                    option.value = role.id;
                    option.textContent = `@${role.name}`;
                    select.appendChild(option);
                });
            });
            showMessage('Channels and roles loaded for dropdowns.', 'success');
        } catch (error) {
            console.error('Error loading channels and roles for dropdowns:', error);
            showMessage('Failed to load channels and roles for dropdowns.', 'error');
        }
    }


    async function loadChannelSetConfig(guildId) {
        availableChannelsList.innerHTML = '<p class="text-pale-blue">Loading channels...</p>';
        try {
            const { configuredChannels, allTextChannels } = await fetchData(`/api/guild/${guildId}/channel-set`);
            availableChannelsList.innerHTML = ''; // Clear loading message

            if (allTextChannels.length === 0) {
                availableChannelsList.innerHTML = '<p class="text-pale-blue">No text channels found in this server.</p>';
                return;
            }

            allTextChannels.forEach(channel => {
                const checkboxDiv = document.createElement('div');
                checkboxDiv.className = 'form-group-inline'; // Use a class for inline styling if needed
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.id = `channel-${channel.id}`;
                checkbox.value = channel.id;
                checkbox.checked = configuredChannels.some(c => c.channelId === channel.id);

                const label = document.createElement('label');
                label.htmlFor = `channel-${channel.id}`;
                label.textContent = `#${channel.name}`;

                checkboxDiv.appendChild(checkbox);
                checkboxDiv.appendChild(label);
                availableChannelsList.appendChild(checkboxDiv);
            });
            showMessage('Channel monitoring settings loaded.', 'success');
        } catch (error) {
            console.error('Error loading channel set config:', error);
            showMessage('Failed to load channel monitoring settings.', 'error');
        }
    }

    async function loadShopPingsConfig(guildId) {
        try {
            const config = await fetchData(`/api/guild/${guildId}/shop-pings`);
            shopChannelSelect.value = config.shopChannelId || '';
            resourcesRoleSelect.value = config.pingRoleIds?.RESOURCES || '';
            lootRoleSelect.value = config.pingRoleIds?.LOOT || '';
            weaponsRoleSelect.value = config.pingRoleIds?.WEAPONS || '';
            ammoRoleSelect.value = config.pingRoleIds?.AMMO || '';
            medsRoleSelect.value = config.pingRoleIds?.MEDS || '';
            showMessage('Shop notification settings loaded.', 'success');
        } catch (error) {
            console.error('Error loading shop pings config:', error);
            showMessage('Failed to load shop notification settings.', 'error');
        }
    }

    // --- Form Submissions ---
    channelSetForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const guildId = guildSelect.value;
        if (!guildId) return;

        const selectedChannels = Array.from(availableChannelsList.querySelectorAll('input[type="checkbox"]:checked'))
                                    .map(checkbox => checkbox.value);

        try {
            await fetchData(`/api/guild/${guildId}/channel-set`, 'POST', { channelIds: selectedChannels });
            showMessage('Channel monitoring settings saved successfully!', 'success');
            await loadChannelSetConfig(guildId); // Reload to confirm
        } catch (error) {
            console.error('Error saving channel set config:', error);
            showMessage('Failed to save channel monitoring settings.', 'error');
        }
    });

    shopPingsForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const guildId = guildSelect.value;
        if (!guildId) return;

        const updateData = {
            shopChannelId: shopChannelSelect.value || null,
            pingRoleIds: {
                RESOURCES: resourcesRoleSelect.value || null,
                LOOT: lootRoleSelect.value || null,
                WEAPONS: weaponsRoleSelect.value || null,
                AMMO: ammoRoleSelect.value || null,
                MEDS: medsRoleSelect.value || null,
            },
        };

        try {
            await fetchData(`/api/guild/${guildId}/shop-pings`, 'POST', updateData);
            showMessage('Shop notification settings saved successfully!', 'success');
            await loadShopPingsConfig(guildId); // Reload to confirm
        } catch (error) {
            console.error('Error saving shop pings config:', error);
            showMessage('Failed to save shop notification settings.', 'error');
        }
    });

    // Initial check
    checkLoginStatus();
});
